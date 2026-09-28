import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { analyze } from "../../lib/cycle";
import type { Exclusions, PeriodEvent } from "../../lib/cycle/types";
import { backupFileName, clearAll, fromJSON, replaceAll, toJSON, useEvents } from "../../db";
import { todayStr } from "../../lib/date";
import Card from "../../ui/Card";
import ConfirmSheet from "../../ui/ConfirmSheet";
import Icon from "../../ui/Icon";
import NoticeBar from "../../ui/NoticeBar";
import "./settings.css";

/**
 * M7 — 设置。画布 frame `设置`。只有「数据」一组，**没有任何二级页**。
 *
 * 摘要两行（plan §3.8）：
 *   ① `已记录 N 段经期 · M 个完整周期`（完整 = 有 cycleLength）
 *   ② 「N 个已排除：…」—— `exclusions` 六个桶长度求和 > 0 时才显示
 *
 * 顺序按画布样张 `2 个已排除：1 个周期过长 · 1 个未记结束` 排（gap 在前）。
 * 六个桶**各有自己的标签**，不会撞名（`incomplete` = 经期本身太长，
 * `stale` = 只记了「来」没记「走」）。
 */
const BUCKETS: [keyof Exclusions, string][] = [
  ["gap", "周期过长"],
  ["incomplete", "经期过长"],
  ["stale", "未记结束"],
  ["orphan", "无法配对"],
  ["future", "未来日期"],
  ["minMaxDropped", "离群周期"],
];

export default function SettingsView(): JSX.Element {
  const today = todayStr();
  const events = useEvents();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sheet, setSheet] = useState<"import" | "clear" | null>(null);
  const [pending, setPending] = useState<PeriodEvent[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const analysis = useMemo(() => (events ? analyze(events, today) : null), [events, today]);

  const summary = useMemo(() => {
    if (!analysis) return { count: 0, complete: 0, excluded: 0, parts: [] as string[] };
    const { episodes, exclusions } = analysis;
    const complete = episodes.filter((e) => e.cycleLength != null).length;
    const nonEmpty = BUCKETS.filter(([k]) => exclusions[k].length > 0);
    return {
      count: episodes.length,
      complete,
      excluded: nonEmpty.reduce((n, [k]) => n + exclusions[k].length, 0),
      parts: nonEmpty.map(([k, label]) => `${exclusions[k].length} 个${label}`),
    };
  }, [analysis]);

  const onPickFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = fromJSON(await file.text());
      setNotice(null);
      setPending(parsed);
      setSheet("import");
    } catch (err) {
      setPending(null);
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const confirmImport = useCallback(async () => {
    if (pending === null) return;
    try {
      await replaceAll(pending);
      const orphans = analyze(pending, today).exclusions.orphan.length;
      setNotice(
        orphans > 0
          ? `发现 ${orphans} 条无法配对的记录（孤立的「来」或「走」），已废弃，不计入预测。`
          : null,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
      setSheet(null);
    }
  }, [pending, today]);

  const exportBackup = useCallback(() => {
    if (!events) return;
    const url = URL.createObjectURL(new Blob([toJSON(events)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName(today);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [events, today]);

  const confirmClear = useCallback(async () => {
    setSheet(null);
    await clearAll();
  }, []);

  if (!analysis) return <div className="view settings" />;

  return (
    <div className="view settings">
      <div className="view__scroll">
        <header className="st-header">
          <h1 className="st-title">设置</h1>
          <p className="st-sub">
            已记录 {summary.count} 段经期 · {summary.complete} 个完整周期
          </p>
          {summary.excluded > 0 && (
            <p className="st-sub st-sub--warn">
              {summary.excluded} 个已排除：{summary.parts.join(" · ")}
            </p>
          )}
        </header>

        <div className="st-body">
          {notice !== null && <NoticeBar>{notice}</NoticeBar>}

          <section className="st-group">
            <span className="st-group__label">数据</span>
            <Card className="st-card">
              <button type="button" className="st-row" onClick={() => fileRef.current?.click()}>
                <span className="st-row__label">从备份导入</span>
                <span className="st-row__right">
                  <span className="st-row__value">JSON</span>
                  <Icon name="chevron-right" size={14} className="st-row__chev" />
                </span>
              </button>
              <div className="st-div" />
              <button type="button" className="st-row" onClick={exportBackup}>
                <span className="st-row__label">导出备份</span>
                <span className="st-row__right">
                  <span className="st-row__value">JSON</span>
                  <Icon name="chevron-right" size={14} className="st-row__chev" />
                </span>
              </button>
              <div className="st-div" />
              <button type="button" className="st-row" onClick={() => setSheet("clear")}>
                <span className="st-row__label st-row__label--danger">清空所有数据</span>
                <span className="st-row__right">
                  <Icon name="chevron-right" size={14} className="st-row__chev" />
                </span>
              </button>
            </Card>
          </section>
        </div>

        <div className="st-spacer" />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onPickFile}
      />

      <ConfirmSheet
        open={sheet === "import"}
        title="导入会覆盖现有数据"
        body={`当前 ${summary.count} 段记录会被备份文件里的内容整体替换，无法撤销。`}
        confirmLabel="确认导入"
        onCancel={() => {
          setPending(null);
          setSheet(null);
        }}
        onConfirm={confirmImport}
      />
      <ConfirmSheet
        open={sheet === "clear"}
        title="清空所有数据？"
        body={`这会永久删除全部 ${summary.count} 段经期记录和预测依据，无法撤销。`}
        confirmLabel="确认清空"
        danger
        onCancel={() => setSheet(null)}
        onConfirm={confirmClear}
      />
    </div>
  );
}