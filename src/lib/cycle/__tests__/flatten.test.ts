import { describe, expect, it } from "vitest";
import { analyze, flattenRange } from "../index";
import type { DateStr, PeriodEvent } from "../types";
import { addDays, dateRange, diffDays } from "../../date";

const DAY0 = "2026-01-01";

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

describe("flattenRange", () => {
  it("13. 跨月连续：范围内每一天都在 Map 里，fill 合法", () => {
    const { events } = makeCycles([28, 28]);
    const a = analyze(events, "2026-06-01");
    const from = "2026-01-01";
    const to = "2026-06-30";
    const map = flattenRange(a, from, to);

    expect(map.size).toBe(diffDays(from, to) + 1);
    const allowed = new Set([
      "recorded",
      "p50",
      "p80",
      "pOut",
      "fertile",
      "ovulation",
      "none",
    ]);
    for (const d of dateRange(from, to)) {
      expect(map.has(d)).toBe(true);
      expect(allowed.has(map.get(d)!.fill)).toBe(true);
    }
  });

  it("13b. 任意子窗口只含该窗口的日期", () => {
    const { events } = makeCycles([28, 28, 28]);
    const a = analyze(events, "2026-06-01");
    const map = flattenRange(a, "2026-02-01", "2026-02-28");
    expect(map.size).toBe(28);
    expect(map.has("2026-01-31")).toBe(false);
    expect(map.has("2026-03-01")).toBe(false);
  });

  it("16. σ 偏大、受孕期与预测重叠时 → fill 优先 fertile / ovulation，不是 p50", () => {
    // pool = [15, 40, 65] → med 40, mad 25, sd ≈ 37.07（n=3，不收缩）
    const { events, lastStart } = makeCycles([15, 40, 65]);
    const today = addDays(lastStart, 30);
    const a = analyze(events, today);

    expect(a.stats.center).toBe(40);
    expect(a.stats.sigma).toBeCloseTo(1.4826 * 25, 4);

    // 当前周期排卵 = round(40) − 14 = 26；6 天窗口 = [21, 26]
    const ovulationDay = addDays(lastStart, 26);
    const fertileDay = addDays(lastStart, 23);
    // 该日同时落在 p50 带内（|23 − 40| = 17 ≤ 0.6745σ ≈ 25）
    expect(Math.abs(23 - 40)).toBeLessThanOrEqual(0.6745 * a.stats.sigma);

    const map = flattenRange(a, lastStart, today);
    expect(map.get(ovulationDay)!.fill).toBe("ovulation");
    expect(map.get(fertileDay)!.fill).toBe("fertile");
    // 其余几天也应是 fertile，而不是被 p50 盖住
    for (const off of [21, 22, 24, 25]) {
      expect(map.get(addDays(lastStart, off))!.fill).toBe("fertile");
    }
  });

  it("概率只在 p50/p80/pOut 上非零，recorded 上为 0", () => {
    const { events, lastStart } = makeCycles([28, 28, 28, 28, 28]);
    const today = "2027-01-01";
    const a = analyze(events, today);
    const map = flattenRange(a, lastStart, "2027-06-30");
    let pcount = 0;
    for (const [, st] of map) {
      if (st.fill === "p50" || st.fill === "p80" || st.fill === "pOut") {
        expect(st.probability).toBeGreaterThan(0);
        pcount++;
      } else {
        expect(st.probability).toBe(0);
      }
    }
    // 至少要有一些粉色预测点存在
    expect(pcount).toBeGreaterThan(0);
  });

  it("without lastStart：只标记 today，不崩", () => {
    const a = analyze([], "2026-05-05");
    const map = flattenRange(a, "2026-05-01", "2026-05-31");
    expect(map.get("2026-05-05")!.today).toBe(true);
    for (const [, st] of map) {
      expect(st.fill).toBe("none");
      expect(st.probability).toBe(0);
    }
  });
});