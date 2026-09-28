/**
 * M2 — 展平：把分析结果铺到每一天。
 *
 * 两层独立：
 * - 填充层：recorded / fertile / ovulation / p50 / p80 / pOut / none，按覆盖优先级折叠
 * - 标记层：`today` 与 `center`，与填充层无关（不会被覆盖优先级抹掉）
 *
 * 覆盖优先级（低 → 高）：pOut < p80 < p50 < fertile < ovulation < recorded
 * 受孕期刻意盖住经期预测的粉色：易孕窗口是「绝不能漏」的输出，σ 偏大时两层粉色会把它盖掉。
 * （plan §3.7 原文把 predicted 排在 ovulation 之上，这里反过来，见项目根 DECISIONS.md D6。）
 */

import { addDays, dateRange, diffDays } from "../date";
import type {
  CycleAnalysis,
  DateStr,
  DayFill,
  DayStateMap,
} from "./types";
import { discreteNormalP } from "./stats";
import { futureBases, recordedOvulationOffsets } from "./predict";
import {
  FERTS_WINDOW_DAYS,
  LUTEAL,
  PERIOD_DEFAULT,
  P_MIN,
  Z50,
  Z80,
} from "./constants";

const PRIO: Record<DayFill, number> = {
  none: 0,
  pOut: 1,
  p80: 2,
  p50: 3,
  fertile: 4,
  ovulation: 5,
  recorded: 6,
};

/**
 * 把 `[from, to]` 闭区间展平成 `Map<DateStr, DayState>`。
 *
 * `today` 与 `center` 取自 `analysis`（不需要调用方传，view 只用 3 个参数）。
 * 越界日期不进 Map，调用方 `map.get(d)` 拿到 undefined 时按「无状态」渲染即可。
 */
export function flattenRange(
  a: CycleAnalysis,
  from: DateStr,
  to: DateStr,
): DayStateMap {
  const today = a.today;
  const map: DayStateMap = new Map();
  for (const d of dateRange(from, to)) {
    map.set(d, { fill: "none", probability: 0, center: false, today: d === today });
  }

  const set = (date: DateStr, fill: DayFill, probability: number) => {
    const cur = map.get(date);
    if (!cur) return;
    if (PRIO[fill] > PRIO[cur.fill]) {
      cur.fill = fill;
      cur.probability = probability;
    }
  };

  const lastStart = a.lastStart;
  const hasPred = lastStart !== null && a.stats.n > 0;

  if (hasPred && lastStart) {
    const mu = a.stats.center;
    const sigma = a.stats.sigma;
    const step = Math.max(1, Math.round(mu));
    const bases = sigma > 0 ? futureBases(mu, diffDays(lastStart, to)) : [];

    // —— 经期预测层：p50 / p80 / pOut，顺带打上「中心日」——
    //
    // 偏差要量到**浮点中心** `mu + k·step` 而不是整数 base：预测周期中心常是 27.5 这种
    // 半整数，用整数 base(28) 去量会让分档和 `i50/i80`（按浮点 μ 算）差一天；
    // σ 很小时（周期特别规律）还会让 p80 这一层整层消失（(Z50σ, Z80σ] 里没有整数）。
    //
    // k < 0 直接跳过：那些是**已经发生过**的周期，位置已有真实记录（红色），
    // 再叠一层预测粉只会把记录日的前一天染上不该有的颜色。
    for (const d of bases.length > 0 ? dateRange(from, to) : []) {
      const off = diffDays(lastStart, d);
      const k = Math.round((off - mu) / step);
      if (k < 0) continue;
      const c = mu + k * step; // 该日归属的那个预测周期的浮点中心
      // 中心日：该周期内 P 最大的那一天（离浮点中心最近的整数日）
      if (off === Math.round(c)) {
        const st = map.get(d);
        if (st) st.center = true;
      }
      const bd = Math.abs(off - c);
      const p = discreteNormalP(off, c, sigma);
      if (bd <= Z50 * sigma) set(d, "p50", p);
      else if (bd <= Z80 * sigma) set(d, "p80", p);
      else if (p >= P_MIN) set(d, "pOut", p);
    }

    // —— 易孕 / 排卵层：每个周期一条 6 天窗口（不含排卵日）——
    // 历史周期用真实的下一次经期首日，当前 + 未来周期用预测中心
    const ovs = recordedOvulationOffsets(a.episodes, lastStart);
    for (const b of bases) ovs.push(b - LUTEAL);
    for (const ov of ovs) {
      for (let back = 1; back <= FERTS_WINDOW_DAYS; back++) {
        set(addDays(lastStart, ov - back), "fertile", 0);
      }
      set(addDays(lastStart, ov), "ovulation", 0);
    }
  }

  // —— 已记录层（最高）：覆盖前面所有粉色 ——
  for (const ep of a.episodes) {
    let end: DateStr | null = null;
    if (ep.end) end = ep.end;
    else if (ep.ongoing) end = today;
    else if (ep.stale) end = addDays(ep.start, PERIOD_DEFAULT - 1);
    else continue; // 未来 / 既非进行中也非 stale 的未闭合段不铺色
    if (end < ep.start) continue;
    for (const d of dateRange(ep.start, end)) set(d, "recorded", 0);
  }

  return map;
}