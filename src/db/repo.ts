/**
 * M3 — 仓库层：事件表的读写。**唯一的写入口是 `appendEvent`（栈顶写入）。**
 *
 * 数据层不变量 I1–I3 任何来源都要满足；交互层约束 C1–C3 只有这里（UI 写入路径）要满足。
 * 导入走 `replaceAll`，绕过 C1–C3。
 */

import { useLiveQuery } from "dexie-react-hooks";
import { isDateStr, todayStr } from "../lib/date";
import type { PeriodEvent } from "../lib/cycle/types";
import { cmpEvents, normalizeEvents } from "./io";
import { db } from "./schema";

/** 读出全部事件并**自己排序**（不要用 Dexie 的返回顺序，见 schema.ts 的说明）。 */
async function readSorted(): Promise<PeriodEvent[]> {
  const rows = await db.events.toArray();
  return rows.sort(cmpEvents);
}

/** 实时订阅全部事件；加载中返回 `undefined`。 */
export function useEvents(): PeriodEvent[] | undefined {
  return useLiveQuery(() => readSorted(), []);
}

/**
 * 追加一条事件（栈顶写入，唯一写入口）。违反 C1–C3 抛中文 Error 且不写入。
 * 校验 + 写入放在同一个事务里，避免两个并发写入都读到旧栈顶。
 */
export function appendEvent(e: PeriodEvent): Promise<void> {
  return db.transaction("rw", db.events, async () => {
    // I1（数据层）：日期必须是真实日历日。UI 正常不会走到这里，导入/手滑才可能。
    if (!isDateStr(e.date)) {
      throw new Error("日期不合法，应该是 YYYY-MM-DD 格式的真实日历日。");
    }
    if (e.type !== "start" && e.type !== "end") {
      throw new Error("事件类型只能是「来」或「走」。");
    }

    const current = await readSorted();
    const top = current.length > 0 ? current[current.length - 1] : null;

    // C1：与栈顶相反；栈空只能 start
    if (top === null) {
      if (e.type !== "start") {
        throw new Error("还没有任何记录，第一条只能记「来」。");
      }
    } else if (e.type === top.type) {
      throw new Error(
        top.type === "start"
          ? "上一条是「来」，这次只能记「走」。"
          : "上一条是「走」，这次只能记「来」。",
      );
    }

    // C2：date ≥ 栈顶 date（**≥ 不是 >**，同一天先「来」再「走」合法）
    if (top !== null && e.date < top.date) {
      throw new Error("记录的日期不能早于上一条。");
    }

    // C3：不能记未来
    if (e.date > todayStr()) {
      throw new Error("还不能记录未来的日期。");
    }

    await db.events.put({ date: e.date, type: e.type });
  });
}

/** 撤销最后一条（等价 pop）。栈空时 no-op。用主键删除。 */
export function undoLast(): Promise<void> {
  return db.transaction("rw", db.events, async () => {
    const current = await readSorted();
    const top = current.length > 0 ? current[current.length - 1] : null;
    if (top === null) return;
    await db.events.delete([top.date, top.type]);
  });
}

/**
 * 整体覆盖导入：一个事务里 `clear()` + `bulkPut()`。
 * **只做 I1–I3 规范化**（过滤非法项、按 `(date,type)` 去重、排序），不施加 C1–C3。
 * 复合主键天然去重，`bulkPut` 就够了。
 */
export function replaceAll(events: PeriodEvent[]): Promise<void> {
  const normalized = normalizeEvents(events);
  return db.transaction("rw", db.events, async () => {
    await db.events.clear();
    if (normalized.length > 0) await db.events.bulkPut(normalized);
  });
}

/** 清空全部数据。 */
export function clearAll(): Promise<void> {
  return db.events.clear();
}