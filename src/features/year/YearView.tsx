import { useCallback, useMemo, useState } from "react";
import { useEvents } from "../../db";
import { analyze, flattenRange } from "../../lib/cycle";
import {
  formatMonthCN,
  formatYearCN,
  monthGrid,
  monthOf,
  todayStr,
  WEEKDAY_LABELS,
  type DateStr,
} from "../../lib/date";
import { fillVisual, peakProbability } from "../../ui/DayCell";
import Icon from "../../ui/Icon";
import "./year.css";

/**
 * M6 — 年视图。画布 `年视图 — 2026年`。
 *
 * Header `年视图` / `2026年` + 今天 + ‹ ›（**跨年切换**）；
 * 图例三项 `经期` / `预测经期` / `最易受孕`；
 * 主体 3 列 × 4 行 = 12 个迷你月历（行优先：1-3 / 4-6 / 7-9 / 10-12）。
 *
 * 迷你月历的格子用和月视图同一套 `fillVisual`，只是缩到 15×17 / 10px。
 * 补位日按画布**不画数字**（画布里 c0–c3 那些格子是空的）。
 */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function YearView(): JSX.Element {
  const today = todayStr();
  const events = useEvents();
  const analysis = useMemo(() => (events ? analyze(events, today) : null), [events, today]);

  const [year, setYear] = useState(() => monthOf(today).year);

  const from: DateStr = `${year}-01-01`;
  const to: DateStr = `${year}-12-31`;
  const days = useMemo(
    () => (analysis ? flattenRange(analysis, from, to) : null),
    [analysis, from, to],
  );

  const grids = useMemo(() => MONTHS.map((m) => monthGrid(year, m)), [year]);

  const maxProbability = useMemo(
    () => peakProbability(analysis?.period ?? null),
    [analysis],
  );

  const goToday = useCallback(() => setYear(monthOf(today).year), [today]);

  if (!days) return <div className="view year" />;

  return (
    <div className="view year">
      <div className="view__scroll">
        <header className="y-header">
          <div className="y-title">
            <span className="y-eyebrow">年视图</span>
            <span className="y-year">{formatYearCN(year)}</span>
          </div>
          <div className="controls">
            <button type="button" className="pill-btn" onClick={goToday}>
              今天
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setYear((y) => y - 1)}
              aria-label="上一年"
            >
              <Icon name="chevron-left" />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setYear((y) => y + 1)}
              aria-label="下一年"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </header>

        <div className="y-legend">
          <span className="y-legend__item">
            <i className="y-legend__sw y-legend__sw--period" />
            经期
          </span>
          <span className="y-legend__item">
            <i className="y-legend__sw y-legend__sw--predict" />
            预测经期
          </span>
          <span className="y-legend__item">
            <i className="y-legend__sw y-legend__sw--fertile" />
            最易受孕
          </span>
        </div>

        <div className="y-grid">
          {grids.map((rows, i) => (
            <section className="ym" key={MONTHS[i]}>
              <span className="ym__label">{formatMonthCN(MONTHS[i])}</span>
              <div className="ym__wd">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="ym__grid">
                {rows.flat().map((d) => {
                  const m = monthOf(d);
                  if (m.year !== year || m.month !== MONTHS[i]) {
                    return <div className="ym__cell" key={d} />;
                  }
                  const st = days.get(d);
                  const fill = st?.fill ?? "none";
                  const v = fillVisual(
                    fill,
                    st?.probability ?? 0,
                    maxProbability,
                    st?.center ?? false,
                  );
                  return (
                    <div
                      className="ym__cell"
                      key={d}
                      style={{
                        background: v.background,
                        // 画布迷你格里无状态的数字是 --text-dim（比月视图的 --text 浅）
                        color: fill === "none" ? "var(--text-dim)" : v.color,
                        fontWeight: v.fontWeight,
                      }}
                    >
                      {Number(d.slice(8, 10))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="y-spacer" />
      </div>
    </div>
  );
}