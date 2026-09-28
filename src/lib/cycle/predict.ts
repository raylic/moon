/**
 * M2 — L3：过滤 + 统计 + 经期预测 + 易孕窗口 + 排卵。
 *
 * 两条铁律：
 * 1. 不同输出用相反口径 —— 经期预测中心估计（中位数/MAD 宽进），
 *    易孕对冲带保守上界（min/max 严出）。
 * 2. 不确定就输出「不确定」—— 小样本向先验收缩；绝不给 NaN。
 */

import { addDays, diffDays } from "../date";
import type {
  CycleStats,
  DateStr,
  Episode,
  FertilePrediction,
  PeriodPrediction,
} from "./types";
import { discreteNormalP, mad, median, zBounds } from "./stats";
import {
  FERTS_WINDOW_DAYS,
  LUTEAL,
  MIN_SD,
  MINMAX_HARD_CAP_MAX,
  MINMAX_HARD_CAP_MIN,
  N,
  OUTLIER_Z,
  PRIOR_MEAN,
  PRIOR_SD,
  Z50,
  Z80,
} from "./constants";

export interface StatsResult {
  stats: CycleStats;
  /** 进入 pool 的段（最近 N 个 cycleOk），按 start 升序 */
  poolEpisodes: Episode[];
  /** 在 pool 里、但被离群判据剔出 min/max 的段 */
  minMaxDropped: Episode[];
}

const ZERO_STATS: CycleStats = {
  n: 0,
  median: 0,
  mad: 0,
  sd: 0,
  mn: 0,
  mx: 0,
  center: 0,
  sigma: 0,
};

/**
 * L3 统计。pool = 最近 N 个 cycleOk 段。
 *
 * min/max 用 Iglewicz–Hoban 改良 z-score 严过滤 + [15,60] 硬上限；
 * 中位数/MAD 不参与该过滤（崩溃点 50% vs min/max 的 0%）。
 * forMinMax 全空时退回未过滤 pool 的 min/max —— 必须有输出。
 */
export function computeStats(episodes: Episode[]): StatsResult {
  const poolEpisodes = episodes.filter((e) => e.cycleOk).slice(-N);
  const pool = poolEpisodes.map((e) => e.cycleLength as number);
  const n = pool.length;

  if (n === 0) {
    return { stats: { ...ZERO_STATS }, poolEpisodes, minMaxDropped: [] };
  }

  const med = median(pool);
  const madValue = mad(pool, med);
  // 下限防 MAD = 0；复用同一个 sd 做离群判据，不重算 MAD
  const sd = Math.max(1.4826 * madValue, MIN_SD);

  const keepIdx: number[] = [];
  pool.forEach((x, i) => {
    if (
      Math.abs(x - med) <= OUTLIER_Z * sd &&
      x >= MINMAX_HARD_CAP_MIN &&
      x <= MINMAX_HARD_CAP_MAX
    ) {
      keepIdx.push(i);
    }
  });
  const usedIdx = keepIdx.length > 0 ? keepIdx : pool.map((_, i) => i);
  const usedVals = usedIdx.map((i) => pool[i]);
  const mn = Math.min(...usedVals);
  const mx = Math.max(...usedVals);

  // 报告的是「离群判据剔掉的段」，与是否触发 fallback 无关 —— 过滤必须可见
  const keepSet = new Set(keepIdx);
  const minMaxDropped = poolEpisodes.filter((_, i) => !keepSet.has(i));

  // 小样本收缩：n < 3 时把 center/sigma 拉向先验
  const w = n / (n + 2);
  const center = n < 3 ? w * med + (1 - w) * PRIOR_MEAN : med;
  const sigma = n < 3 ? w * sd + (1 - w) * PRIOR_SD : sd;

  return {
    stats: { n, median: med, mad: madValue, sd, mn, mx, center, sigma },
    poolEpisodes,
    minMaxDropped,
  };
}

/**
 * 下一次经期预测（对应当前记录周期的 j = 1）。
 * mu 是「下一个经期相对 lastStart 的浮点偏移」，不取整。
 */
export function buildPeriod(
  lastStart: DateStr | null,
  stats: CycleStats,
): PeriodPrediction | null {
  if (!lastStart || stats.n === 0 || stats.sigma <= 0) return null;
  const mu = stats.center;
  const sigma = stats.sigma;
  const mode = Math.round(mu);
  const half = Math.ceil(4 * sigma);

  const daily = [];
  for (let D = mode - half; D <= mode + half; D++) {
    const p = discreteP(D, mu, sigma);
    if (p < 1e-6) continue;
    daily.push({ date: addDays(lastStart, D), p });
  }

  const i50 = zBounds(mu, sigma, Z50);
  const i80 = zBounds(mu, sigma, Z80);
  return {
    centerDate: addDays(lastStart, mode),
    mu,
    daily,
    i50: [addDays(lastStart, i50.lo), addDays(lastStart, i50.hi)],
    i80: [addDays(lastStart, i80.lo), addDays(lastStart, i80.hi)],
  };
}

/**
 * 当前周期的易孕预测。
 * - inner：6 天生物学窗口 [排卵−5, 排卵]
 * - conservative：Ogino-Knaus ∪ SDM（原始 min/max，无自造 margin）
 * - ovulation：round(mu) − LUTEAL
 */
export function buildFertile(
  lastStart: DateStr | null,
  stats: CycleStats,
): FertilePrediction | null {
  if (!lastStart || stats.n === 0) return null;
  const ovOff = Math.round(stats.center) - LUTEAL;
  const ovulation = addDays(lastStart, ovOff);
  const inner: [DateStr, DateStr] = [
    addDays(lastStart, ovOff - FERTS_WINDOW_DAYS),
    ovulation,
  ];

  // Ogino-Knaus：offset = 天序号 − 1 → [mn − 19, mx − 12]
  let lo = stats.mn - 19;
  let hi = stats.mx - 12;
  // SDM：仅当 26 ≤ mn 且 mx ≤ 32
  if (stats.mn >= 26 && stats.mx <= 32) {
    lo = Math.min(lo, 7);
    hi = Math.max(hi, 18);
  }
  return {
    inner,
    conservative: [addDays(lastStart, lo), addDays(lastStart, hi)],
    ovulation,
  };
}

/**
 * 各未来经期的整数起始偏移 `base_j = round(center) + j · round(center)`，j = 0,1,2…
 *
 * j = 0 是**下一次**（当前周期的下一段）。排卵是「紧接其后的那次经期」前 14 天，
 * 所以 j = 0 这个 base 减 LUTEAL 正好是**当前周期**的排卵偏移。
 */
export function futureBases(center: number, maxOff: number): number[] {
  const step = Math.max(1, Math.round(center));
  const b1 = Math.round(center);
  const out: number[] = [];
  for (let j = 0; j < 1000; j++) {
    const b = b1 + j * step;
    out.push(b);
    if (b > maxOff + step) break;
  }
  return out;
}

/**
 * **历史周期**（不含当前周期）的排卵偏移，相对 lastStart。
 *
 * plan §3.5：历史周期的排卵用**真实**的下一次经期首日（不是预测中心）——
 * 中心是估计值，真实值才是那一段实际发生的事；用估计值会让历史排卵点
 * 随每个周期的实际长度偏差漂 ±3 天。
 *
 * 当前周期的排卵**不在这里**：它由 `futureBases()[0] − LUTEAL` 给出（用预测中心）。
 * 两者合起来每个周期恰好一条，不重不漏。
 */
export function recordedOvulationOffsets(
  episodes: Episode[],
  lastStart: DateStr,
): number[] {
  const ovs: number[] = [];
  for (let i = 0; i + 1 < episodes.length; i++) {
    const sNext = diffDays(lastStart, episodes[i + 1].start);
    ovs.push(sNext - LUTEAL);
  }
  return ovs;
}

/** 正态 CDF 离散化，供 predict / flatten 共用（stats 的实现再导出）。 */
export const discreteP = discreteNormalP;