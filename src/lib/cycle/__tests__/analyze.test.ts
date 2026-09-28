import { describe, expect, it } from "vitest";
import { analyze, flattenRange } from "../index";
import type { DateStr, PeriodEvent } from "../types";
import { addDays, diffDays } from "../../date";

/** 固定日期，绝不用 new Date()。 */
const DAY0 = "2026-01-01";
/** 远在所有记录之后，保证没有 ongoing / stale 干扰。 */
const FUTURE_TODAY = "2028-01-01";

/**
 * 用「周期长度数组」造事件：每个周期 = start → +4 天 end → 下一个 start。
 * 返回的 lastStart 是最后一个 start。cycleLength 数量 = gaps.length。
 */
function makeCycles(
  gaps: number[],
  start0: DateStr = DAY0,
): { events: PeriodEvent[]; lastStart: DateStr } {
  const events: PeriodEvent[] = [];
  let d = start0;
  events.push({ date: d, type: "start" });
  for (const g of gaps) {
    events.push({ date: addDays(d, 4), type: "end" });
    d = addDays(d, g);
    events.push({ date: d, type: "start" });
  }
  events.push({ date: addDays(d, 4), type: "end" });
  return { events, lastStart: d };
}

function poolOf(a: ReturnType<typeof analyze>): number[] {
  return a.episodes
    .filter((e) => e.cycleOk)
    .map((e) => e.cycleLength as number)
    .slice(-6);
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

describe("L3 统计", () => {
  it("1. 规则 28 天 × 8 周期 → center = 28，sigma = MIN_SD", () => {
    const { events } = makeCycles(new Array(8).fill(28));
    const a = analyze(events, FUTURE_TODAY);
    expect(a.stats.n).toBe(6);
    expect(a.stats.center).toBe(28);
    expect(a.stats.sigma).toBeCloseTo(1.5, 10);
    expect(a.stats.sd).toBeCloseTo(1.5, 10);
  });

  it("2. 26–32 天波动 × 8 周期 → center 等于中位数，i80 宽度合理", () => {
    const { events } = makeCycles([26, 28, 30, 32, 26, 28, 30, 32, 27]);
    const a = analyze(events, FUTURE_TODAY);
    const pool = poolOf(a);
    expect(a.stats.center).toBe(medianOf(pool));
    expect(a.period).not.toBe(null);
    const w = diffDays(a.period!.i80[0], a.period!.i80[1]);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(20);
  });

  it("3. 含一个 75 天离群 → 中位数不被拉偏；75 被剔出 min/max", () => {
    const { events } = makeCycles([28, 28, 28, 28, 28, 75]);
    const a = analyze(events, FUTURE_TODAY);
    const pool = poolOf(a);
    const mean = pool.reduce((s, x) => s + x, 0) / pool.length;
    expect(a.stats.center).toBeLessThan(mean - 5); // 中位数不被离群拉偏
    expect(a.stats.mx).toBeLessThan(64); // 对冲带末端没被撑到第 64 天
    expect(a.exclusions.minMaxDropped.length).toBe(1);
    expect(a.exclusions.minMaxDropped[0].cycleLength).toBe(75);
  });

  it("4. 高度离散 [30,45,50,55,60,75] → mx 被 60 上天花板兜住", () => {
    const { events } = makeCycles([30, 45, 50, 55, 60, 75]);
    const a = analyze(events, FUTURE_TODAY);
    expect(a.stats.mx).toBe(60);
  });

  it("5. 仅 1 / 2 个周期 → 向先验收缩", () => {
    const one = analyze([...makeCycles([24]).events], FUTURE_TODAY);
    expect(one.stats.n).toBe(1);
    expect(one.stats.center).toBeGreaterThan(24);
    expect(one.stats.center).toBeLessThan(29);
    expect(one.stats.sigma).toBeGreaterThan(one.stats.sd); // 明显大于纯样本 sd

    const two = analyze(makeCycles([26, 30]).events, FUTURE_TODAY);
    expect(two.stats.n).toBe(2);
    expect(two.stats.median).toBe(28);
    expect(two.stats.center).toBeGreaterThan(28);
    expect(two.stats.center).toBeLessThan(29);
    expect(two.stats.sigma).toBeGreaterThan(two.stats.sd);
  });

  it("6. 3 个周期 → 完全用样本，不再收缩", () => {
    const a = analyze(makeCycles([28, 30, 26]).events, FUTURE_TODAY);
    expect(a.stats.n).toBe(3);
    expect(a.stats.center).toBe(a.stats.median);
    expect(a.stats.center).toBe(28);
    expect(a.stats.sigma).toBe(a.stats.sd);
  });

  it("7. forMinMax 全被剔除 → 退回未过滤 pool 的 min/max，不抛", () => {
    const a = analyze(makeCycles([70, 75]).events, FUTURE_TODAY);
    expect(a.stats.n).toBe(2);
    expect(a.stats.mn).toBe(70);
    expect(a.stats.mx).toBe(75);
    expect(a.exclusions.minMaxDropped.length).toBe(2);
  });
});

describe("L1/L2 配对与段级", () => {
  it("8. start 无 end → periodLength null，cycleLength 仍可用并进池", () => {
    const events: PeriodEvent[] = [
      { date: "2026-01-01", type: "start" },
      { date: "2026-01-05", type: "end" },
      { date: "2026-01-29", type: "start" },
      { date: "2026-02-02", type: "end" },
      { date: "2026-02-26", type: "start" }, // 未闭合
    ];
    const a = analyze(events, "2026-03-01");
    expect(a.episodes.length).toBe(3);
    expect(a.episodes[0].periodLength).toBe(5);
    expect(a.episodes[0].cycleLength).toBe(28);
    expect(a.episodes[2].periodLength).toBe(null);
    expect(a.episodes[2].cycleLength).toBe(null);
    expect(a.episodes[2].ongoing).toBe(true);
    expect(a.stats.n).toBe(2); // 前两段 cycleOk
  });

  it("9. start, start, end → 前一个 start 进 orphan，后一个正常配对", () => {
    const events: PeriodEvent[] = [
      { date: "2026-01-01", type: "start" },
      { date: "2026-01-29", type: "start" },
      { date: "2026-02-02", type: "end" },
    ];
    const a = analyze(events, "2026-02-10");
    expect(a.exclusions.orphan.length).toBe(1);
    expect(a.exclusions.orphan[0]).toEqual({
      date: "2026-01-01",
      type: "start",
    });
    expect(a.episodes.length).toBe(1);
    expect(a.episodes[0].start).toBe("2026-01-29");
    expect(a.episodes[0].end).toBe("2026-02-02");
  });

  it("10. 孤立 end 打头 → 忽略配对，保留在 orphan", () => {
    const events: PeriodEvent[] = [
      { date: "2026-01-01", type: "end" },
      { date: "2026-01-10", type: "start" },
      { date: "2026-01-14", type: "end" },
    ];
    const a = analyze(events, "2026-02-01");
    expect(a.exclusions.orphan.length).toBe(1);
    expect(a.exclusions.orphan[0]).toEqual({
      date: "2026-01-01",
      type: "end",
    });
    expect(a.episodes.length).toBe(1);
    expect(a.episodes[0].periodLength).toBe(5);
  });

  it("11. 同日 start + end → periodLength = 1，该日展平为 recorded", () => {
    const events: PeriodEvent[] = [
      { date: "2026-01-10", type: "start" },
      { date: "2026-01-10", type: "end" },
    ];
    const a = analyze(events, "2026-02-01");
    expect(a.episodes[0].periodLength).toBe(1);
    expect(a.episodes[0].cycleLength).toBe(null);
    expect(flattenRange(a, "2026-01-01", "2026-01-31").get("2026-01-10")!.fill).toBe(
      "recorded",
    );
  });

  it("12. 未来日期事件 → 进 exclusions.future，且统计量不变", () => {
    const { events } = makeCycles([28, 28, 28, 28]);
    const today = "2026-08-01";
    const base = analyze(events, today);
    const withFuture = analyze(
      [...events, { date: addDays(today, 30), type: "start" }],
      today,
    );
    expect(withFuture.exclusions.future.length).toBe(1);
    expect(withFuture.stats).toEqual(base.stats);
    expect(withFuture.lastStart).toBe(base.lastStart);
  });
});

describe("预测与对冲带", () => {
  it("15. 最短周期 24 天 → 对冲带照公式给出很靠前的窗口，不兜底不返回 null", () => {
    const { events, lastStart } = makeCycles([24, 24, 24, 24]);
    const a = analyze(events, FUTURE_TODAY);
    expect(a.stats.mn).toBe(24);
    expect(a.stats.mn - 18).toBeLessThan(8);
    expect(a.fertile).not.toBe(null);
    // Ogino-Knaus: [mn−19, mx−12] = [5, 12]
    expect(a.fertile!.conservative[0]).toBe(addDays(lastStart, 5));
    expect(a.fertile!.conservative[1]).toBe(addDays(lastStart, 12));
    expect(a.fertile!.ovulation).toBe(addDays(lastStart, 10)); // round(24)−14
  });

  it("14. 纯函数 / 确定性：两次结果深相等，且不改传入数组", () => {
    const { events } = makeCycles([28, 30, 26, 28]);
    const snapshot = JSON.parse(JSON.stringify(events));
    const a = analyze(events, FUTURE_TODAY);
    const b = analyze(events, FUTURE_TODAY);
    expect(a).toEqual(b);
    expect(flattenRange(a, DAY0, FUTURE_TODAY)).toEqual(
      flattenRange(b, DAY0, FUTURE_TODAY),
    );
    expect(JSON.parse(JSON.stringify(events))).toEqual(snapshot);
  });

  it("确定性：today 标记落在 today 那天", () => {
    const { events } = makeCycles([28]);
    const a = analyze(events, FUTURE_TODAY);
    expect(flattenRange(a, DAY0, FUTURE_TODAY).get(FUTURE_TODAY)?.today).toBe(true);
  });

  it("无事件输入不崩，且不预测", () => {
    const a = analyze([], FUTURE_TODAY);
    expect(a.episodes.length).toBe(0);
    expect(a.lastStart).toBe(null);
    expect(a.period).toBe(null);
    expect(a.fertile).toBe(null);
    expect(a.stats.n).toBe(0);
    expect(a.stats.center).toBe(0);
    expect(flattenRange(a, FUTURE_TODAY, FUTURE_TODAY).get(FUTURE_TODAY)?.today).toBe(
      true,
    );
  });

  it("非法 date 事件被跳过，不崩", () => {
    const events = [
      { date: "not-a-date", type: "start" },
      { date: "2026-01-01", type: "start" },
      { date: "2026-01-05", type: "end" },
    ] as unknown as PeriodEvent[];
    const a = analyze(events, "2026-02-01");
    expect(a.episodes.length).toBe(1);
  });
});