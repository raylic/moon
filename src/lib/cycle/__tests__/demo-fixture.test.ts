/**
 * 黄金测试：在 `fixtures/demo-backup.json` 这份真实数据上把整条流水线钉住。
 *
 * 全部期望值都是**手算**的（注释里写了算式），不是从实现里抄回来的 —— 否则这个测试
 * 只能证明「代码没变」，不能证明「算对了」。
 *
 * 数据：8 段经期，首日 2026-02-16 / 03-17 / 04-13 / 05-13 / 06-10 / 07-06 / 08-06 / 09-02，
 * 末段 2026-09-02 ~ 2026-09-07，today = 2026-09-28。
 */

import { describe, expect, it } from "vitest";
import fixture from "../../../../fixtures/demo-backup.json";
import { analyze, flattenRange } from "../index";
import type { DayFill, PeriodEvent } from "../types";

const EVENTS = fixture.events as PeriodEvent[];
const TODAY = "2026-09-28";
const a = analyze(EVENTS, TODAY);

// 视图就是这么用的：按可见范围现算，不依赖任何「默认窗口」
const Q3Q4 = flattenRange(a, "2026-02-01", "2026-11-30");
const SEPT_WIDE = flattenRange(a, "2026-08-25", "2026-10-05");
const fill = (date: string): DayFill => Q3Q4.get(date)?.fill ?? "none";
const st = (date: string) => SEPT_WIDE.get(date)!;

describe("流水线黄金测试（demo fixture）", () => {
  it("配对：8 段经期，最后一段闭合，无孤立事件", () => {
    expect(a.episodes).toHaveLength(8);
    expect(a.exclusions.orphan).toHaveLength(0);
    expect(a.lastStart).toBe("2026-09-02");
    expect(a.episodes[7].end).toBe("2026-09-07");
    expect(a.episodes[7].periodLength).toBe(6); // 09-02..09-07 含首尾
    expect(a.episodes[7].cycleLength).toBeNull(); // 最后一段还没有下一次 start
    expect(a.episodes[0].cycleLength).toBe(29); // 02-16 → 03-17
  });

  it("cycleLength 全部落在合理区间 → 无 gap / incomplete / stale / future", () => {
    expect(a.exclusions.gap).toHaveLength(0);
    expect(a.exclusions.incomplete).toHaveLength(0);
    expect(a.exclusions.stale).toHaveLength(0);
    expect(a.exclusions.future).toHaveLength(0);
  });

  // 7 个间隔 = 29 27 30 28 26 31 27；池取最后 6 个 = [27,30,28,26,31,27]
  // 排序 [26,27,27,28,30,31] → median = (27+28)/2 = 27.5
  // |x−27.5| = [0.5,2.5,0.5,1.5,3.5,0.5] 排序 [0.5,0.5,0.5,1.5,2.5,3.5] → mad = 1.0
  // sd = max(1.4826×1.0, MIN_SD=1.5) = 1.5
  // 离群线 = 3.5×1.5 = 5.25，最大偏差 3.5 → 全部保留 → mn=26, mx=31
  it("统计量：中位数 27.5 / MAD 1.0 / σ 1.5 / min-max 26-31", () => {
    expect(a.stats.n).toBe(6);
    expect(a.stats.median).toBe(27.5);
    expect(a.stats.mad).toBeCloseTo(1, 10);
    expect(a.stats.sd).toBeCloseTo(1.5, 10);
    expect(a.stats.mn).toBe(26);
    expect(a.stats.mx).toBe(31);
    // n = 6 ≥ 3 → 不收缩
    expect(a.stats.center).toBe(27.5);
    expect(a.stats.sigma).toBeCloseTo(1.5, 10);
    expect(a.exclusions.minMaxDropped).toHaveLength(0);
  });

  // 09-02 + round(27.5)=28 → 09-30
  it("下次经期预测：中心 09-30，i50 = 09-29~09-30，i80 = 09-28~10-01", () => {
    expect(a.period).not.toBeNull();
    expect(a.period!.mu).toBe(27.5);
    expect(a.period!.centerDate).toBe("2026-09-30");
    // i50: ceil(27.5−0.6745×1.5)=ceil(26.488)=27 → 09-29；floor(28.512)=28 → 09-30
    expect(a.period!.i50).toEqual(["2026-09-29", "2026-09-30"]);
    // i80: ceil(27.5−1.2816×1.5)=ceil(25.578)=26 → 09-28；floor(29.422)=29 → 10-01
    expect(a.period!.i80).toEqual(["2026-09-28", "2026-10-01"]);
  });

  // 排卵 = round(27.5) − 14 = 14 → 09-02 + 14 = 09-16
  // 生物学窗口 = [排卵−5, 排卵] = 09-11 ~ 09-16（6 天）
  // 对冲带 Ogino = [mn−19, mx−12] = [7, 19] → 09-09 ~ 09-21
  //        SDM（26 ≤ 26 且 31 ≤ 32）= [7, 18] → 并集仍是 [7, 19]
  it("易孕：排卵 09-16，6 天窗口 09-11~09-16，对冲带 09-09~09-21", () => {
    expect(a.fertile).not.toBeNull();
    expect(a.fertile!.ovulation).toBe("2026-09-16");
    expect(a.fertile!.inner).toEqual(["2026-09-11", "2026-09-16"]);
    expect(a.fertile!.conservative).toEqual(["2026-09-09", "2026-09-21"]);
  });

  it("栈状态：栈顶是 09-07 的「走」", () => {
    expect(a.stack.top).toEqual({ date: "2026-09-07", type: "end" });
    expect(a.stack.nextType).toBe("start");
    expect(a.stack.daysSinceEnd).toBe(21); // 09-07 → 09-28
    expect(a.stack.dayIndex).toBeNull();
  });

  describe("9 月展平（逐日）", () => {
    it("已记录经期 09-02 ~ 09-07", () => {
      for (const d of [
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
        "2026-09-06",
        "2026-09-07",
      ]) {
        expect(fill(d)).toBe("recorded");
      }
    });

    it("最易受孕 09-11 ~ 09-15，排卵日 09-16", () => {
      for (const d of [
        "2026-09-11",
        "2026-09-12",
        "2026-09-13",
        "2026-09-14",
        "2026-09-15",
      ]) {
        expect(fill(d)).toBe("fertile");
      }
      expect(fill("2026-09-16")).toBe("ovulation");
    });

    // 第 1 个预测周期的浮点中心 = 27.5（09-30 前后），σ=1.5：
    //   Z50·σ = 1.0118   Z80·σ = 1.9224
    //   off 27 / 28 → bd 0.5 → p50      （即 i50 = [27,28] → 09-29、09-30）
    //   off 26 / 29 → bd 1.5 → p80      （即 i80 = [26,29] → 09-28、10-01）
    //   off 25 / 30 / 31 → bd ≥ 2.5 且 P ≥ 0.02 → pOut
    //   off 24 / 32 → P = 0.0189 / 0.0025 < P_MIN=0.02 → none
    it("预测经期四档：09-26 无 / 09-27 极浅 / 09-28 浅 / 09-29~30 实", () => {
      expect(fill("2026-09-26")).toBe("none"); // P = 0.019 < P_MIN
      expect(fill("2026-09-27")).toBe("pOut");
      expect(fill("2026-09-28")).toBe("p80");
      expect(fill("2026-09-29")).toBe("p50");
      expect(fill("2026-09-30")).toBe("p50");
      expect(fill("2026-10-01")).toBe("p80");
      expect(fill("2026-10-02")).toBe("pOut");
    });

    it("空档日期是 none", () => {
      for (const d of [
        "2026-09-01",
        "2026-09-08",
        "2026-09-09",
        "2026-09-10",
        "2026-09-17",
        "2026-09-20",
        "2026-09-21",
        "2026-09-25",
      ]) {
        expect(fill(d)).toBe("none");
      }
    });

    it("过去的预测周期不铺粉色：记录首日的前一天是 none，不是粉色", () => {
      // off −1 属于「上一个周期」（其经期已在 09-02 真实记录），k < 0 → 跳过
      expect(fill("2026-09-01")).toBe("none");
      expect(fill("2026-09-02")).toBe("recorded");
    });

    it("中心日：每两个预测周期各一个，且是那个周期里 P 最大的一天", () => {
      // 中心 27.5 → 中心日 off 28 = 09-30；中心 55.5 → off 56 = 10-28
      expect(st("2026-09-30").center).toBe(true);
      expect(st("2026-09-29").center).toBe(false);
      expect(st("2026-09-28").center).toBe(false);
      expect(fill("2026-10-28")).toBe("p50");
      expect(Q3Q4.get("2026-10-28")!.center).toBe(true);
      expect(st("2026-09-28").probability).toBeLessThan(st("2026-09-30").probability);
    });

    it("今天标记只打在 09-28，且与填充层、中心日互相独立", () => {
      const todays = [...Q3Q4.values()].filter((s) => s.today).length;
      expect(todays).toBe(1);
      expect(st("2026-09-28").today).toBe(true);
      expect(st("2026-09-28").fill).toBe("p80"); // 今天同时落在 80% 区间里
      expect(st("2026-09-28").center).toBe(false); // 但今天不是中心日
      expect(st("2026-09-29").today).toBe(false);
      expect(st("2026-09-30").today).toBe(false);
    });

    it("probability 只在 p50/p80/pOut 上非零，且中心日最大", () => {
      expect(st("2026-09-01").probability).toBe(0);
      expect(st("2026-09-28").probability).toBeGreaterThan(0);
      expect(st("2026-09-30").probability).toBeGreaterThan(st("2026-09-28").probability);
    });

    it("峰值概率可复现：period.daily 的 max 就是中心日的 P", () => {
      const peak = Math.max(...a.period!.daily.map((d) => d.p));
      expect(peak).toBeCloseTo(st("2026-09-30").probability, 12);
    });
  });

  it("历史周期的排卵用真实的下一次经期首日（不是预测中心）", () => {
    // 06-10 那一段的真实间隔 = 26 天（06-10 → 07-06），排卵 = 07-06 − 14 = 06-22
    // 若错用预测中心 round(27.5)=28，会算成 06-10 + 28 − 14 = 06-24，差 2 天
    expect(fill("2026-06-22")).toBe("ovulation");
    expect(fill("2026-06-24")).not.toBe("ovulation");
    expect(fill("2026-06-17")).toBe("fertile"); // 06-22 − 5
    // 08-06 那一段真实间隔 27 天（08-06 → 09-02）→ 排卵 08-19
    expect(fill("2026-08-19")).toBe("ovulation");
  });

  it("未来周期递推：10 月里第 1 个和第 2 个预测周期都画出来了", () => {
    // 预测周期浮点中心：27.5（09-30 前后）→ 55.5（10-27.5 前后）→ 83.5（11-24.5 前后）
    expect(fill("2026-10-26")).toBe("p80"); // off 54，对中心 55.5 偏差 1.5
    expect(fill("2026-10-27")).toBe("p50"); // off 55，偏差 0.5
    expect(fill("2026-10-28")).toBe("p50"); // off 56，偏差 0.5
    expect(fill("2026-10-29")).toBe("p80"); // off 57，偏差 1.5
    expect(fill("2026-10-30")).toBe("pOut"); // off 58，偏差 2.5，P = 0.0685
    expect(fill("2026-10-31")).toBe("none"); // off 59，P = 0.0189 < P_MIN
  });

  it("flattenRange 覆盖请求的整个闭区间，一格不缺", () => {
    const m = flattenRange(a, "2027-03-01", "2027-04-30");
    expect(m.size).toBe(61);
    expect(m.has("2027-03-01")).toBe(true);
    expect(m.has("2027-04-30")).toBe(true);
  });

  it("纯函数：同样输入两次结果一致，且不改动传入数组", () => {
    const copy = JSON.parse(JSON.stringify(EVENTS)) as PeriodEvent[];
    const b = analyze(copy, TODAY);
    expect([...flattenRange(b, "2026-09-01", "2026-09-30").entries()]).toEqual([
      ...flattenRange(a, "2026-09-01", "2026-09-30").entries(),
    ]);
    expect(copy).toEqual(EVENTS);
  });

  it("空数据不崩：period / fertile 为 null，只有 today 标记", () => {
    const z = analyze([], TODAY);
    expect(z.episodes).toHaveLength(0);
    expect(z.lastStart).toBeNull();
    expect(z.period).toBeNull();
    expect(z.fertile).toBeNull();
    expect(z.stats.n).toBe(0);
    expect(z.stack.top).toBeNull();
    const m = flattenRange(z, "2026-09-01", "2026-09-30");
    expect(m.size).toBe(30);
    expect(m.get(TODAY)!.today).toBe(true);
    expect(m.get(TODAY)!.fill).toBe("none");
    expect(m.get(TODAY)!.center).toBe(false);
    expect([...m.values()].every((s) => s.probability === 0)).toBe(true);
  });
});