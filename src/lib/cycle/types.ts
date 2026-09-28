/**
 * M2 — 计算模块的**类型契约**。
 *
 * 本文件由主 agent 冻结，是 M2 / M3 / M4 / M5–M8 之间唯一的共享面。
 * 子 agent 只读不改。要改先改 plan 的「五、模块划分」。
 */

import type { DateStr } from "../date";

export type { DateStr };

export type EventType = "start" | "end";

/**
 * 一个记录事件。**月经记录的全部内容就是这张表**。
 * 刻意不含 id / createdAt —— 栈模型下「身份 = 位置」。
 */
export interface PeriodEvent {
  date: DateStr;
  /** start = 月经来了；end = 月经走了 */
  type: EventType;
}

/**
 * 一段经期。由 start/end 配对派生。
 * 孤立事件（配对失败的 start/end）不产生 Episode，只进 exclusions。
 */
export interface Episode {
  start: DateStr;
  /** 未闭合为 null */
  end: DateStr | null;
  /** 天数含首尾；未闭合为 null */
  periodLength: number | null;
  /** start → 下一个 start 的天数；最后一个段为 null */
  cycleLength: number | null;
  /** 未闭合且距 today ≤ 10 天 */
  ongoing: boolean;
  /** 未闭合且距 today > 10 天（仅用于「漏记了吗」提示） */
  stale: boolean;
  /** periodLength != null && ≤ 15 */
  periodOk: boolean;
  /** cycleLength != null && 15 ≤ x ≤ 90 */
  cycleOk: boolean;
}

export interface CycleStats {
  /** 参与统计的周期数（pool.length） */
  n: number;
  median: number;
  mad: number;
  /** max(1.4826 * mad, MIN_SD) */
  sd: number;
  /** 过滤后的 min / max（用于日历法对冲带） */
  mn: number;
  mx: number;
  /** 经期预测中心（n < 3 时向先验 29 收缩）；n === 0 时为 0 */
  center: number;
  /** 经期预测标准差（n < 3 时向先验 4.5 收缩）；n === 0 时为 0 */
  sigma: number;
}

export interface DailyProbability {
  date: DateStr;
  /** P(该日为经期首日)，正态 CDF 离散化 */
  p: number;
}

export interface PeriodPrediction {
  /** 预测中心日 = lastStart + round(center) */
  centerDate: DateStr;
  /** 浮点中心，lastStart + center，用于离散化 */
  mu: number;
  daily: DailyProbability[];
  /** 50% 区间 ±0.6745σ */
  i50: [DateStr, DateStr];
  /** 80% 区间 ±1.2816σ */
  i80: [DateStr, DateStr];
}

export interface FertilePrediction {
  /** 生物学易孕窗口 = 排卵日−5 … 排卵日（6 天，Wilcox 2000）。日历上只画这个 */
  inner: [DateStr, DateStr];
  /** 日历法对冲带 = Ogino-Knaus ∪ SDM（原始 min/max，无自造 margin） */
  conservative: [DateStr, DateStr];
  /** 排卵估算日 = 下次经期预测中心 − LUTEAL */
  ovulation: DateStr;
}

/**
 * 被排除的数据。**过滤必须可见**（plan 3.8），设置页摘要读这里。
 * 每项是受影响的 Episode（orphan 除外，它没有 Episode，用 epoch 占位见下）。
 */
export interface Exclusions {
  /** 配对失败的孤立事件（栈空遇 end / 连续 start 的前一个） */
  orphan: PeriodEvent[];
  /** start 在未来，全程不参与 */
  future: Episode[];
  /** 未闭合且超 10 天 */
  stale: Episode[];
  /** 与前一段的间隔不在 [15, 90] 天（过短或过长都算「间隔异常」） */
  gap: Episode[];
  /** 经期过长（> 15 天） */
  incomplete: Episode[];
  /** 被 Iglewicz–Hoban 离群判据剔出 min/max 的周期 */
  minMaxDropped: Episode[];
}

/** 记录模块读的栈状态。文案在 M5，这里只给数字。 */
export interface StackState {
  /** 栈顶事件；栈空为 null */
  top: PeriodEvent | null;
  /** 下一个合法事件类型（栈空必为 start） */
  nextType: EventType;
  /** 栈顶是 start 时：经期进行中第几天（含首日 = 1）；否则 null */
  dayIndex: number | null;
  /** 栈顶是 end 时：距该次经期结束多少天；否则 null */
  daysSinceEnd: number | null;
}

/** 填充层状态，已按覆盖优先级折叠为一个。 */
export type DayFill =
  | "recorded"
  | "p50"
  | "p80"
  | "pOut"
  | "fertile"
  | "ovulation"
  | "none";

/** 展平到单日的状态。`selected` / `outside` 由视图自己算，不属于计算结果。 */
export interface DayState {
  fill: DayFill;
  /** 该日被预测为经期首日的概率 P(D)；无预测为 0 */
  probability: number;
  /**
   * 是否是所在预测周期的**中心日**（浮点中心的四舍五入那天，即该周期 P 最大的那天）。
   * 月/年视图用它决定 50% 区间内哪一天用白字。每个预测周期恰有一天为 true。
   */
  center: boolean;
  /** 标记层：今天 */
  today: boolean;
}

export type DayStateMap = Map<DateStr, DayState>;

export interface CycleAnalysis {
  /**
   * 已配对且 **start ≤ today** 的段，按 start 升序。
   * `start > today` 的段（只可能来自导入）只进 `exclusions.future`，
   * 不进这里、也不参与 cycleLength 链和 lastStart —— 否则预测会被锚定在未来。
   */
  episodes: Episode[];
  /** 计算所用的「今天」。flatten 要它来打 today 标记，也用来判 ongoing/stale。 */
  today: DateStr;
  stats: CycleStats;
  /** 最近一次经期首日（含进行中的段）；无记录为 null */
  lastStart: DateStr | null;
  /** n === 0 时为 null（不预测） */
  period: PeriodPrediction | null;
  /** 无 lastStart 或 n === 0 时为 null */
  fertile: FertilePrediction | null;
  exclusions: Exclusions;
  stack: StackState;
}

/**
 * 每日状态**不由 analyze() 返回**，而是按需取区间：
 *
 *   flattenRange(analysis, from, to) → DayStateMap
 *
 * 这样月视图（42 格）和年视图（365 天）各自只算自己要的范围，
 * 也不会出现「翻到很远的月份却什么都没有」的窗口边界问题。
 */