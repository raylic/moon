/**
 * M2 计算模块的全部魔法数字。每条注明依据。
 * 改这里之前先读 plan「参数表」与项目根的 DECISIONS.md。
 */

/** 统计池取最近多少个周期。取 6：够估中位数/MAD，又不会被太老的生活方式变化污染。 */
export const N = 6;

/** 标准差下限。MAD = 0（样本全相等）时 sd 必须非零，否则 z 值/高斯 CDF 除零。 */
export const MIN_SD = 1.5;

/** 小样本收缩先验均值：日历法教材默认的 29 天周期。 */
export const PRIOR_MEAN = 29;
/** 小样本收缩先验标准差：人群周期长度 SD ≈ 4.5 天（n < 3 时用）。 */
export const PRIOR_SD = 4.5;

/** Iglewicz–Hoban 改良 z-score 阈值，仅用于 min/max 严过滤（中位数/MAD 不用）。 */
export const OUTLIER_Z = 3.5;

/** 周期长度的合理区间 [15, 90]。超出即「间隔异常」进 gap 桶，不进统计池。 */
export const CYCLE_MIN_PLAUSIBLE = 15;
export const CYCLE_MAX_PLAUSIBLE = 90;

/**
 * min/max 的硬上限。样本高度离散时（如 [30,45,50,55,60,75]，MAD=7.5）
 * 3.5σ 线宽到 39 天，75 会漏过离群判据，靠这个硬上限兜底。
 */
export const MINMAX_HARD_CAP_MIN = 15;
export const MINMAX_HARD_CAP_MAX = 60;

/** 单次经期最长合理天数，超过视为「没记完/异常」进 incomplete 桶。 */
export const PERIOD_MAX = 15;

/** 未闭合段超过这么多天就判定为 stale（大概漏记了「走」）。 */
export const MISSING_END_WARN = 10;

/** 黄体期长度（天）。排卵 = 下次经期预测中心 − LUTEAL。 */
export const LUTEAL = 14;

/** 未闭合段在展平时按这几天铺「经期」色（仅显示用）。 */
export const PERIOD_DEFAULT = 5;

/** 展平时 P(D) 低于此值就不再画「可能有经期」的浅粉点。 */
export const P_MIN = 0.02;

/** 50% / 80% 区间的 z 值（标准正态）。 */
export const Z50 = 0.6745;
export const Z80 = 1.2816;

/** 生物学易孕窗口：排卵前 5 天 + 排卵日 = 6 天（Wilcox 2000）。 */
export const FERTS_WINDOW_DAYS = 5;