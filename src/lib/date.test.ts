import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  dayOfWeek,
  daysInMonth,
  diffDays,
  formatCN,
  isDateStr,
  monthGrid,
  monthOf,
  parseLocal,
  toDateStr,
  todayStr,
} from "./date";

describe("M1 date — 本地民用日期字符串", () => {
  it("isDateStr 接受真实日历日、拒绝伪造日", () => {
    expect(isDateStr("2026-09-04")).toBe(true);
    expect(isDateStr("2024-02-29")).toBe(true); // 闰年
    expect(isDateStr("2026-02-29")).toBe(false); // 平年
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2026-13-01")).toBe(false);
    expect(isDateStr("2026-00-10")).toBe(false);
    expect(isDateStr("2026-04-31")).toBe(false);
    expect(isDateStr("2026-9-4")).toBe(false); // 必须补零
    expect(isDateStr("2026/09/04")).toBe(false);
    expect(isDateStr("")).toBe(false);
    expect(isDateStr(20260904)).toBe(false);
  });

  it("daysInMonth 的 month 参数是 1–12", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("字典序 === 日期序（这是把它当排序键的前提）", () => {
    const xs = ["2026-09-04", "2026-09-10", "2025-12-31", "2026-01-01"];
    expect([...xs].sort()).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-09-04",
      "2026-09-10",
    ]);
  });

  it("diffDays 是 to - from，跨月跨年跨闰日都准", () => {
    expect(diffDays("2026-09-01", "2026-09-01")).toBe(0);
    expect(diffDays("2026-09-01", "2026-09-02")).toBe(1);
    expect(diffDays("2026-09-02", "2026-09-01")).toBe(-1);
    expect(diffDays("2026-08-31", "2026-09-01")).toBe(1);
    expect(diffDays("2025-12-31", "2026-01-01")).toBe(1);
    expect(diffDays("2024-02-28", "2024-03-01")).toBe(2); // 含 2/29
    expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
    // 美国夏令时切换日（2026-03-08）不应产生 ±1 天误差
    expect(diffDays("2026-03-07", "2026-03-08")).toBe(1);
    expect(diffDays("2026-03-08", "2026-03-09")).toBe(1);
    expect(diffDays("2026-11-01", "2026-11-02")).toBe(1);
  });

  it("addDays 跨月/跨年/闰日", () => {
    expect(addDays("2026-09-01", 29)).toBe("2026-09-30");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-09-04", 0)).toBe("2026-09-04");
  });

  it("addDays 与 diffDays 互逆", () => {
    for (let n = -400; n <= 400; n += 7) {
      expect(diffDays("2026-02-16", addDays("2026-02-16", n))).toBe(n);
    }
  });

  it("dayOfWeek 以周日为 0", () => {
    expect(dayOfWeek("2026-09-27")).toBe(0); // 周日
    expect(dayOfWeek("2026-09-28")).toBe(1); // 周一
    expect(dayOfWeek("2026-09-04")).toBe(5); // 周五
  });

  it("monthGrid 固定 6×7、以周日打头、含上下月补位", () => {
    const g = monthGrid(2026, 9);
    expect(g).toHaveLength(6);
    for (const row of g) expect(row).toHaveLength(7);
    // 2026-09-01 是周二 → 首行前两个是 8/30、8/31
    expect(g[0][0]).toBe("2026-08-30");
    expect(g[0][2]).toBe("2026-09-01");
    expect(g[0][6]).toBe("2026-09-05");
    expect(g[5][6]).toBe("2026-10-10");
    // 42 天连续无跳号、无重复
    const flat = g.flat();
    expect(new Set(flat).size).toBe(42);
    expect(diffDays(flat[0], flat[41])).toBe(41);
  });

  it("monthGrid 对每个月的第一天都落在周日那一列", () => {
    for (let m = 1; m <= 12; m++) {
      const g = monthGrid(2026, m);
      const firstOfMonth = `2026-${String(m).padStart(2, "0")}-01`;
      const col = g[0][0] === firstOfMonth ? 0 : g[0].indexOf(firstOfMonth);
      expect(col).toBe(dayOfWeek(firstOfMonth));
      expect(g.flat()).toContain(firstOfMonth);
    }
  });

  it("monthOf / formatCN / todayStr / toDateStr / parseLocal", () => {
    expect(monthOf("2026-09-04")).toEqual({ year: 2026, month: 9 });
    expect(formatCN("2026-09-04")).toBe("9月4日");
    expect(formatCN("2026-12-31")).toBe("12月31日");
    expect(todayStr(new Date(2026, 8, 28, 23, 59))).toBe("2026-09-28");
    expect(todayStr(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
    expect(toDateStr(parseLocal("2026-09-04"))).toBe("2026-09-04");
  });

  it("dateRange 是闭区间、升序", () => {
    expect(dateRange("2026-09-01", "2026-09-01")).toEqual(["2026-09-01"]);
    expect(dateRange("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
    expect(dateRange("2026-09-02", "2026-09-01")).toEqual([]);
  });
});