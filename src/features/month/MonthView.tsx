import { useCallback, useMemo, useState } from "react";
import { appendEvent, undoLast, useEvents } from "../../db";
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
import DayCell from "../../ui/DayCell";
import Icon from "../../ui/Icon";
import Toast, { useToast } from "../../ui/Toast";
import { peakProbability } from "../../ui/DayCell";
import RecordModule from "./RecordModule";
import "./month.css";

/**
 * M5 — 月视图。画布 `月视图 — 2026年9月` / `月视图 — 空数据态`。
 *
 * 只读 `useEvents()` + `analyze()`，所以月/年/设置三页天然同步（都订阅同一份数据）。
 * 布局：Header 56 → 日历块（星期行 28 + 6×46 网格）→ 记录模块 → 158 底部空白。
 * 底部 158px 是设计稿明确留的空白（悬浮 TabBar 由 M9 渲染在页面外），不要填东西。
 *
 * 每日状态**按可见范围现算**（`flattenRange` 只铺当前 6×7 的 42 格），
 * 不依赖任何「默认窗口」，翻到多远的月份都有正确的预测。
 */
export default function MonthView(): JSX.Element {
  const today = todayStr();
  const events = useEvents();
  const toast = useToast();

  const analysis = useMemo(() => (events ? analyze(events, today) : null), [events, today]);

  const [cursor, setCursor] = useState(() => monthOf(today));
  const [selected, setSelected] = useState<DateStr | null>(today);

  const rows = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const days = useMemo(() => {
    if (!analysis) return null;
    const flat = rows.flat();
    return flattenRange(analysis, flat[0], flat[flat.length - 1]);
  }, [analysis, rows]);

  // 50% 区间内的透明度以「该分布的峰值概率」为 1 —— 对每个预测周期都一样
  // （σ 相同），所以直接用下一次经期的日概率取 max，不随可见月份变化。
  const maxProbability = useMemo(
    () => peakProbability(analysis?.period ?? null),
    [analysis],
  );

  const shiftMonth = useCallback((delta: number) => {
    setCursor(({ year, month }) => {
      const idx = year * 12 + (month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  }, []);

  const goToday = useCallback(() => {
    setCursor(monthOf(today));
    setSelected(today);
  }, [today]);

  /** 点日历格 = 选中该日（不改数据）；再点同一格取消选中。未来日期只弹 toast。 */
  const pick = useCallback(
    (d: DateStr) => {
      if (d > today) {
        toast.show("还不能记录未来的日期");
        return;
      }
      setSelected((prev) => (prev === d ? null : d));
    },
    [today, toast],
  );

  const record = useCallback(async () => {
    if (!analysis || selected === null || selected > today) return;
    try {
      await appendEvent({ date: selected, type: analysis.stack.nextType });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  }, [analysis, selected, today, toast]);

  const undo = useCallback(async () => {
    try {
      await undoLast();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  }, [toast]);

  if (!analysis || !days) return <div className="view" />;

  return (
    <div className="view">
      <div className="view__scroll">
        <header className="m-header">
          <div className="m-title">
            <span className="m-year">{formatYearCN(cursor.year)}</span>
            <span className="m-month">{formatMonthCN(cursor.month)}</span>
          </div>
          <div className="controls">
            <button type="button" className="pill-btn" onClick={goToday}>
              今天
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftMonth(-1)}
              aria-label="上个月"
            >
              <Icon name="chevron-left" />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftMonth(1)}
              aria-label="下个月"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </header>

        <div className="m-cal">
          <div className="m-weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="m-grid">
            {rows.flat().map((d) => {
              const st = days.get(d);
              const fill = st?.fill ?? "none";
              const m = monthOf(d);
              return (
                <DayCell
                  key={d}
                  day={Number(d.slice(8, 10))}
                  fill={fill}
                  probability={st?.probability ?? 0}
                  maxProbability={maxProbability}
                  center={st?.center ?? false}
                  today={d === today}
                  selected={selected === d}
                  outside={m.year !== cursor.year || m.month !== cursor.month}
                  onClick={() => pick(d)}
                />
              );
            })}
          </div>
        </div>

        <RecordModule
          today={today}
          selected={selected}
          stack={analysis.stack}
          onRecord={record}
          onUndo={undo}
        />

        {/* 设计稿明确要求的底部留白，不要填东西 */}
        <div className="m-spacer" />
      </div>

      <Toast message={toast.message} />
    </div>
  );
}