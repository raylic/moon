/**
 * M3 — Dexie schema。
 *
 * 全部月经数据就是一张 `events` 表，主键用**复合主键** `[date+type]`。
 * 选它的四个理由：
 *  1. 不需要额外的 `id` 字段 —— 栈模型下「身份 = 位置」，事件本来就没有身份；
 *  2. 同一日期可以同时存在 start 和 end（同一天先「来」后「走」，一天经期）；
 *  3. 主键本身就强制了「无重复事件」（I3），导入时非法重复会被天然挡掉；
 *  4. 单列索引 `date` 供范围查询（某月 / 某年）。
 *
 * ⚠️ 排序陷阱：复合主键的索引顺序对同一天的 start / end 按 `type` 的**字典序**排，
 * 也就是 `"end"` 排在 `"start"` **前面** —— 这违反业务规则（同日的 start 必须在 end 之前）。
 * 因此**读出来之后必须自己排序**，见 `io.ts` 的 `cmpEvents`，不要依赖 Dexie 的返回顺序。
 */

import Dexie, { type Table } from "dexie";
import type { DateStr, EventType, PeriodEvent } from "../lib/cycle/types";

/** 数据库名。改了会丢用户数据，别动。 */
export const DB_NAME = "moon";

export class MoonDB extends Dexie {
  /** `[date+type]` 复合主键；`date` 另建单列索引。 */
  events!: Table<PeriodEvent, [DateStr, EventType]>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      events: "[date+type], date",
    });
  }
}

export const db = new MoonDB();