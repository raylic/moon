/**
 * M2 — 基础统计：中位数 / MAD / 正态 CDF（零依赖 erf 近似）。
 * 全部是纯函数，不碰日期对象。
 */

/** 中位数。偶数个取中间两个的均值。空数组返回 0（调用方负责判空）。 */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 中位数绝对偏差 MAD = median(|x − med|)。 */
export function mad(xs: number[], med: number): number {
  return median(xs.map((x) => Math.abs(x - med)));
}

/**
 * erf 的 Abramowitz–Stegun 7.1.26 近似（最大误差 ≈ 1.5e-7）。
 * 常数照抄 plan，不要「优化」。
 */
export function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return (
    s *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x))
  );
}

/** 标准正态 CDF。 */
export function Phi(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * 正态 CDF 的整日离散化：P(该整数偏移日 = 经期首日)
 * = Phi((D + 0.5 − mu)/σ) − Phi((D − 0.5 − mu)/σ)。
 */
export function discreteNormalP(D: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  return Phi((D + 0.5 - mu) / sigma) - Phi((D - 0.5 - mu) / sigma);
}

/**
 * 以 (mu, sigma) 为中心、z 倍标准差的整数偏移区间 [lo, hi]。
 * 用于 PeriodPrediction 的 i50 / i80。
 *
 * 用 `ceil` / `floor` 而不是 `round`：判据是「这一天的**格心**落在 ±zσ 内」，
 * 即 `|D − mu| <= zσ`。这样 i50/i80 和 flatten 里按 `|off − mu|` 分档的结果
 * 逐日一致；用 round 会在边界上多算一天，出现「i50 说在里面、days 说是 p80」的矛盾。
 */
export function zBounds(
  mu: number,
  sigma: number,
  z: number,
): { lo: number; hi: number } {
  return {
    lo: Math.ceil(mu - z * sigma),
    hi: Math.floor(mu + z * sigma),
  };
}