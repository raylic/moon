/**
 * M1 — 本地日期字符串运算。
 *
 * 铁律：**全部输入输出都是本地民用日期字符串 `"YYYY-MM-DD"`**，绝不使用 Date 对象、
 * epoch 毫秒或 UTC 字符串做跨模块传输。月经是「哪一天」不是「哪个时刻」。
 * `"YYYY-MM-DD"` 的字典序 === 日期序，所以它同时是排序键、比较键、Map 键。
 *
 * 本文件由主 agent 冻结，子 agent 只读不改。要改先改 plan。
 */

/** 本地民用日期，`"YYYY-MM-DD"`。 */
export type DateStr = string;

/** 星期行固定以「日」打头（与设置页「周起始日 = 周日」一致）。 */
export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** 某年某月的天数。`month` 是 1–12（不是 0–11）。 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 是否是合法的 `YYYY-MM-DD` 且为真实日历日（会拒绝 2 月 30 日）。 */
export function isDateStr(s: unknown): s is DateStr {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

/** `"2026-09-04"` → 本地时间当天 0 点的 Date。**不要**用它做跨天运算的载体。 */
export function parseLocal(s: DateStr): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date（本地时间）→ `"YYYY-MM-DD"`。 */
export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 今天。可传入 now 便于测试。 */
export function todayStr(now: Date = new Date()): DateStr {
  return toDateStr(now);
}

/**
 * 日期加减天数。用 `setDate` 走本地日历，跨月跨年跨夏令时都对。
 */
export function addDays(s: DateStr, n: number): DateStr {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}

/**
 * `to - from`，单位天。参数顺序是 (早, 晚)，返回可以为负。
 *
 * 内部用 `Date.UTC` 做差：两侧都被当成同一时刻的 UTC 零点，
 * 差值恒为 86400000 的整数倍，夏令时不会导致 ±1 天误差。
 */
export function diffDays(from: DateStr, to: DateStr): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
}

/** 0 = 周日 … 6 = 周六。 */
export function dayOfWeek(s: DateStr): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** `"2026-09-04"` → `{ year: 2026, month: 9 }`（month 是 1–12）。 */
export function monthOf(s: DateStr): { year: number; month: number } {
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m };
}

/**
 * 月视图用的 6 行 × 7 列网格，**以周日打头**，含上下月补位日。
 * 固定 6 行所以月份切换时高度不跳。
 */
export function monthGrid(year: number, month: number): DateStr[][] {
  const first = `${year}-${pad2(month)}-01`;
  const start = addDays(first, -dayOfWeek(first));
  const rows: DateStr[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DateStr[] = [];
    for (let i = 0; i < 7; i++) row.push(addDays(start, w * 7 + i));
    rows.push(row);
  }
  return rows;
}

/** `"2026-09-04"` → `"9月4日"`。 */
export function formatCN(s: DateStr): string {
  const { month } = monthOf(s);
  const d = Number(s.slice(8, 10));
  return `${month}月${d}日`;
}

/** `2026` → `"2026年"`。 */
export function formatYearCN(year: number): string {
  return `${year}年`;
}

/** `9` → `"9月"`。 */
export function formatMonthCN(month: number): string {
  return `${month}月`;
}

/** 取一段闭区间内的所有日期，升序。用来给 flattenRange 划范围。 */
export function dateRange(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}