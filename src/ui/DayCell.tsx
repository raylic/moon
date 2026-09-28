import type { CSSProperties } from "react";
import type { DayFill, PeriodPrediction } from "../lib/cycle/types";

/**
 * 该分布的峰值日概率，作为 50% 区间透明度的分母（ratio = P / peak）。
 *
 * 用「下一次经期」的 `daily` 取 max 就够了：所有预测周期共用同一个 σ 和同一个
 * 小数部分，峰值完全一样。这样比值不随可见月份变化 —— 否则一个只露出 p50 边缘的
 * 月份会把边缘日算成 ratio = 1，和真正中心日一样深，把梯度读反。
 */
export function peakProbability(period: PeriodPrediction | null): number {
  if (!period || period.daily.length === 0) return 0;
  let max = 0;
  for (const d of period.daily) if (d.p > max) max = d.p;
  return max;
}

/**
 * M4 — 日历格。月视图与年视图（迷你格）共用同一套填充语义。
 *
 * 视觉规则 = 画布 `日期格状态一览` 那 11 张样张：
 *   recorded   #E4576B 实心 + 白字（600）
 *   p50        #E4576B + alpha `0.62 + 0.28 * (P / Pmax)`；中心日白字 500，其余深玫红
 *   p80        #E4576B + alpha 0.22，深玫红字
 *   pOut       #E4576B + alpha 0.10，深玫红字
 *   fertile    #4FA3A540，字 #2F7C7E
 *   ovulation  #4FA3A573 + 1.5px 内描边 #2F7C7E，字 #2F7C7E 加粗
 *   today      #F3EFED + 数字加粗（**不是描边**）
 *   selected   2px 内描边 #2E2A2B，与填充层叠加
 *   outside    无填充，字 --text-faint
 *   none       无填充
 *
 * 画布上描边是 `strokeAlignment: inner`，所以实现用 inset box-shadow，
 * 保证 46×46 的格子不因描边变大。
 *
 * 关于写死的 rgb：预测浓度是「按天算出来的 alpha」，必须在 JS 里拼 `rgba(...)`，
 * 没法直接用 `var(--period)`。所以只在下面两个常量里保留色值，其余一律走 token。
 */
const PERIOD_RGB = "228, 87, 107"; // var(--period)
const FERTILE_RGB = "79, 163, 165"; // var(--fertile)

/** 填充层 + 文字层（不含 today / selected / outside 这三个标记层）。 */
export interface FillVisual {
  background?: string;
  color: string;
  fontWeight?: number;
  boxShadow?: string;
}

export function fillVisual(
  fill: DayFill,
  probability: number,
  maxProbability: number,
  center: boolean,
): FillVisual {
  switch (fill) {
    case "recorded":
      return { background: "var(--period)", color: "var(--surface)", fontWeight: 600 };
    case "p50": {
      const k = maxProbability > 0 ? Math.min(1, Math.max(0, probability / maxProbability)) : 1;
      const alpha = (0.62 + 0.28 * k).toFixed(3);
      return {
        background: `rgba(${PERIOD_RGB}, ${alpha})`,
        color: center ? "var(--surface)" : "var(--period-deep)",
        fontWeight: 500,
      };
    }
    case "p80":
      return { background: `rgba(${PERIOD_RGB}, 0.22)`, color: "var(--period-deep)" };
    case "pOut":
      return { background: `rgba(${PERIOD_RGB}, 0.10)`, color: "var(--period-deep)" };
    case "fertile":
      return { background: `rgba(${FERTILE_RGB}, 0.25)`, color: "var(--fertile-deep)" };
    case "ovulation":
      return {
        background: `rgba(${FERTILE_RGB}, 0.45)`,
        color: "var(--fertile-deep)",
        fontWeight: 600,
        boxShadow: "inset 0 0 0 1.5px var(--fertile-deep)",
      };
    default:
      return { color: "var(--text)" };
  }
}

export interface DayCellProps {
  /** 日期数字 */
  day: number;
  fill: DayFill;
  /** 该日 P(D) */
  probability: number;
  /** 该预测周期内的最大 P，用来算 50% 区间内的透明度 */
  maxProbability: number;
  /** 是否为预测中心日（中心日白字） */
  center: boolean;
  today: boolean;
  selected: boolean;
  /** 非当月补位日（**仍然可点** —— 补记上月底需要它） */
  outside: boolean;
  onClick?: () => void;
}

export default function DayCell({
  day,
  fill,
  probability,
  maxProbability,
  center,
  today,
  selected,
  outside,
  onClick,
}: DayCellProps): JSX.Element {
  const v = fillVisual(fill, probability, maxProbability, center);

  // 填充层：数据色优先，其次「今天」底色，最后透明
  const background = v.background ?? (today ? "var(--today-bg)" : undefined);
  // 补位日且无数据 → --text-faint
  const color = fill === "none" && outside ? "var(--text-faint)" : v.color;
  // 「今天」永远是加粗，压过填充层的字重
  const fontWeight = today ? 700 : v.fontWeight;

  const shadows = [v.boxShadow, selected ? "inset 0 0 0 2px var(--text)" : null].filter(
    (s): s is string => Boolean(s),
  );

  const style: CSSProperties = {
    background,
    color,
    fontWeight,
    boxShadow: shadows.length > 0 ? shadows.join(", ") : undefined,
  };

  return (
    <button
      type="button"
      className="daycell"
      style={style}
      onClick={onClick}
      aria-pressed={selected}
      data-fill={fill}
      data-outside={outside || undefined}
    >
      {day}
    </button>
  );
}