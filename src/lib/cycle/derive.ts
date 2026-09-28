/**
 * M2 — 事件 → Episode。栈配对（L1）+ 段级校验（L2）。
 *
 * L0（结构校验）属于导入路径，M3 负责；这里只做「非法 date 不崩」（跳过即可）。
 */

import { diffDays, isDateStr } from "../date";
import type { DateStr, EventType, Episode, PeriodEvent, StackState } from "./types";
import {
  CYCLE_MAX_PLAUSIBLE,
  CYCLE_MIN_PLAUSIBLE,
  MISSING_END_WARN,
  PERIOD_MAX,
} from "./constants";

/**
 * 事件排序：日期升序；同日 **start 排在 end 前**。
 * 否则同日 [end, start] 会把 start 变成孤立事件，语义错。
 */
export function compareEvents(a: PeriodEvent, b: PeriodEvent): number {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  if (a.type === b.type) return 0;
  return a.type === "start" ? -1 : 1;
}

/** 只保留结构合法的输入（非法 date / 未知 type 一律跳过，绝不抛）。 */
export function sanitizeEvents(events: PeriodEvent[]): PeriodEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter(
    (e) =>
      !!e &&
      isDateStr(e.date) &&
      (e.type === "start" || e.type === "end"),
  );
}

export interface DerivedEpisodes {
  /** 已配对段（start ≤ today），按 start 升序 */
  episodes: Episode[];
  /** start > today 的段，只进 exclusions.future，不参与统计 */
  future: Episode[];
  /** 配对失败的孤立事件 */
  orphan: PeriodEvent[];
}

/**
 * L1 栈配对 + 段级派生。
 *
 * 栈模型：栈里最多一个未闭合的 start。
 * - 栈空遇 end → 孤立废弃
 * - push start 时栈非空 → 上一个 start 孤立废弃
 * - 扫描结束栈里剩下的 start → 进行中的段，保留
 */
export function deriveEpisodes(
  events: PeriodEvent[],
  today: DateStr,
): DerivedEpisodes {
  const sorted = sanitizeEvents(events).sort(compareEvents);

  const pairs: { start: DateStr; end: DateStr | null }[] = [];
  const open: PeriodEvent[] = []; // 当栈用，长度 ≤ 1
  const orphan: PeriodEvent[] = [];

  for (const ev of sorted) {
    if (ev.type === "start") {
      if (open.length > 0) orphan.push(open.pop() as PeriodEvent);
      open.push(ev);
    } else {
      if (open.length === 0) {
        orphan.push(ev);
      } else {
        const s = open.pop() as PeriodEvent;
        pairs.push({ start: s.date, end: ev.date });
      }
    }
  }
  for (const s of open) pairs.push({ start: s.date, end: null });

  pairs.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const nonFuture = pairs.filter((p) => p.start <= today);
  const futureSegs = pairs.filter((p) => p.start > today);

  const episodes: Episode[] = [];
  for (let i = 0; i < nonFuture.length; i++) {
    const nextStart = i + 1 < nonFuture.length ? nonFuture[i + 1].start : null;
    episodes.push(
      makeEpisode(
        nonFuture[i].start,
        nonFuture[i].end,
        nextStart ? diffDays(nonFuture[i].start, nextStart) : null,
        today,
        false,
      ),
    );
  }

  const future = futureSegs.map((p) =>
    makeEpisode(p.start, p.end, null, today, true),
  );

  return { episodes, future, orphan };
}

function makeEpisode(
  start: DateStr,
  end: DateStr | null,
  cycleLength: number | null,
  today: DateStr,
  isFuture: boolean,
): Episode {
  const periodLength = end ? diffDays(start, end) + 1 : null;
  const unclosed = end === null;
  // future 段一律不算 ongoing / stale（否则「距 today 为负」会误判为进行中）
  const ongoing =
    unclosed && !isFuture && diffDays(start, today) <= MISSING_END_WARN;
  const stale =
    unclosed && !isFuture && diffDays(start, today) > MISSING_END_WARN;
  const periodOk = periodLength !== null && periodLength <= PERIOD_MAX;
  const cycleOk =
    cycleLength !== null &&
    cycleLength >= CYCLE_MIN_PLAUSIBLE &&
    cycleLength <= CYCLE_MAX_PLAUSIBLE;
  return {
    start,
    end,
    periodLength,
    cycleLength,
    ongoing,
    stale,
    periodOk,
    cycleOk,
  };
}

/** 记录模块读的栈状态。 */
export function computeStack(events: PeriodEvent[], today: DateStr): StackState {
  const sorted = sanitizeEvents(events).sort(compareEvents);
  const top: PeriodEvent | null =
    sorted.length > 0 ? sorted[sorted.length - 1] : null;
  if (!top) {
    return { top: null, nextType: "start", dayIndex: null, daysSinceEnd: null };
  }
  const nextType: EventType = top.type === "start" ? "end" : "start";
  const dayIndex = top.type === "start" ? diffDays(top.date, today) + 1 : null;
  const daysSinceEnd = top.type === "end" ? diffDays(top.date, today) : null;
  return { top, nextType, dayIndex, daysSinceEnd };
}