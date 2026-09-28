/**
 * M2 — 对外唯一出口。调用方只从这里导入。
 *
 * analyze() 是纯函数：不碰 React / IndexedDB / 全局变量，today 由参数传入。
 */

import type { CycleAnalysis, DateStr, Exclusions, PeriodEvent } from "./types";
import { deriveEpisodes, computeStack } from "./derive";
import { buildFertile, buildPeriod, computeStats } from "./predict";
import { flattenRange } from "./flatten";
import {
  CYCLE_MAX_PLAUSIBLE,
  CYCLE_MIN_PLAUSIBLE,
  PERIOD_MAX,
} from "./constants";

export * from "./types";

export function analyze(events: PeriodEvent[], today: DateStr): CycleAnalysis {
  const { episodes, future, orphan } = deriveEpisodes(events, today);
  const { stats, minMaxDropped } = computeStats(episodes);

  const lastStart =
    episodes.length > 0 ? episodes[episodes.length - 1].start : null;

  const period = buildPeriod(lastStart, stats);
  const fertile = buildFertile(lastStart, stats);

  const exclusions: Exclusions = {
    orphan,
    future,
    stale: episodes.filter((e) => e.stale),
    gap: episodes.filter(
      (e) =>
        e.cycleLength !== null &&
        (e.cycleLength < CYCLE_MIN_PLAUSIBLE ||
          e.cycleLength > CYCLE_MAX_PLAUSIBLE),
    ),
    incomplete: episodes.filter(
      (e) => e.periodLength !== null && e.periodLength > PERIOD_MAX,
    ),
    minMaxDropped,
  };

  const stack = computeStack(events, today);

  return {
    episodes,
    today,
    stats,
    lastStart,
    period,
    fertile,
    exclusions,
    stack,
  };
}

export { flattenRange };