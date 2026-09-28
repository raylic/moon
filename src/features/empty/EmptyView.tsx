import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { fromJSON, fromLooseJSON, replaceAll } from "../../db";
import { analyze } from "../../lib/cycle";
import type { PeriodEvent } from "../../lib/cycle/types";
import { todayStr } from "../../lib/date";
import { IMPORT_PROMPT } from "../../lib/importPrompt";
import Button from "../../ui/Button";
import ConfirmSheet from "../../ui/ConfirmSheet";
import Toast, { useToast } from "../../ui/Toast";
import "./empty.css";

/**
 * M8 — 空状态（首启的门）。画布 frame `空状态 — 首次进入` +
 * `空状态 — 迁移入口 B`：无 Header、无 TabBar，内容垂直居中。
 *
 * 插画是画布上那组 path / rectangle：上方一个月牙（#322E2F），下方一本挂墙日历
 * （描边 #353031 + 4×4 的日期格）。**透明底**，画布没有给它任何背景色块。
 *
 * 三条入口：
 *   ① 从备份导入（JSON）—— Moon 自己的备份，走**严格**解析
 *   ② 复制提示词        —— 把 `IMPORT_PROMPT` 送进剪贴板，给 AI 用
 *   ③ 从剪贴板导入      —— 读剪贴板，走**宽容**解析（`fromLooseJSON`）
 */
const CELL_COLS = [58.7365, 74.7314, 90.7788, 106.9352];
const CELL_ROWS = [103.6423, 117.3687, 131.2665, 144.9418];
const CELL_W = 13.3;
const CELL_H = 11.22;
const CELL_FILLS = [
  ["#ffffff", "#EA5970", "#56AAAA", "#ffffff"],
  ["#56AAAA", "#ffffff", "#EA5970", "#ffffff"],
  ["#ffffff", "#56AAAA", "#ffffff", "#EA5970"],
  ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
];

function Illustration(): JSX.Element {
  return (
    <svg
      className="empty__art"
      width={172}
      height={172}
      viewBox="0 0 172 172"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* 月牙 */}
      <path
        d="M32.87351 0c-19.00601 0-32.87351 17.501-32.87351 35.6685 0 19.049 13.803 32.465 32.2285 32.465 14.7275 0 25.198-9.6535 27.43401-15.265 0.258-0.731-0.2365-1.28999-1.032-1.0535-3.39701 1.462-7.353 2.1285-10.81451 2.1285-14.835 0-25.714-11.5025-25.714-25.4345 0-12.255 8.04101-22.3815 18.2105-26.058 0.86-0.4085 0.7095-1.247-0.215-1.462-2.4725-0.7095-4.8805-0.989-7.22399-0.989z"
        fill="#322E2F"
        transform="translate(60.286 8.342)"
      />

      {/* 日历外壳（顶部留出挂钩的位置） */}
      <path
        d="M60.63 0l3.7625 0c3.87 0 6.85851 2.967 6.85851 6.837l0 53.01899c0 3.87-3.20351 6.923-6.96601 6.92301l-57.491 0c-4.0205 0-6.794-3.05301-6.794-6.92301l0-53.01899c0-3.87 2.967-6.837 6.794-6.837l3.827 0"
        stroke="#353031"
        strokeWidth={2.3162}
        transform="translate(53.793 93.1165)"
      />
      {/* 横杆 */}
      <path
        d="M0 0h32.02145"
        stroke="#353031"
        strokeWidth={2.2345}
        transform="translate(73.3982 93.1066)"
      />
      {/* 两个挂钩 */}
      <rect x={66.2826} y={86.0679} width={5.2974} height={13.0404} rx={2.6487} fill="#353031" />
      <rect x={107.3005} y={86.0679} width={5.2974} height={13.0404} rx={2.6487} fill="#353031" />

      {/* 4×4 日期格 */}
      {CELL_ROWS.map((y, r) =>
        CELL_COLS.map((x, c) => (
          <rect
            key={`${r}-${c}`}
            x={x}
            y={y}
            width={CELL_W}
            height={CELL_H}
            rx={2.64}
            fill={CELL_FILLS[r][c]}
            stroke="#3D3636"
            strokeWidth={1.0354}
          />
        )),
      )}
    </svg>
  );
}

/**
 * 剪贴板 API 抛的是浏览器自己的 DOMException（英文）。
 * 把它翻译成能直接展示的中文；我们自己抛的 Error 原样透出。
 */
function clipboardErrorMessage(err: unknown): string {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (name === "NotAllowedError") return "没能读到剪贴板，请在浏览器提示时允许粘贴";
  if (name === "NotFoundError") return "剪贴板里没有文本";
  if (name === "SecurityError") return "这个环境不允许读剪贴板，请改用「从备份导入」";
  return err instanceof Error ? err.message : String(err);
}

export default function EmptyView({ onStart }: { onStart: () => void }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  /** 剪贴板内容能解析、但有记录无法配对时，先让用户确认再导入 */
  const [warn, setWarn] = useState<{ events: PeriodEvent[]; orphans: number } | null>(null);

  const onPickFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      try {
        const parsed = fromJSON(await file.text());
        if (parsed.length === 0) {
          // 否则用户选完文件什么都不会发生，看不出是空了还是失败了
          toast.show("这份备份里没有任何记录");
          return;
        }
        await replaceAll(parsed);
        // 成功后 events.length > 0，App 自己会切到月视图，这里不用再做任何事
      } catch (err) {
        toast.show(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const copyPrompt = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("这个浏览器不支持复制，请手动选中提示词复制");
      }
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      toast.show("提示词已复制，发给任意 AI 即可");
    } catch (err) {
      toast.show(clipboardErrorMessage(err));
    }
  }, [toast]);

  const importFromClipboard = useCallback(async () => {
    setBusy(true);
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("这个浏览器不支持读剪贴板，请改用「从备份导入」");
      }
      const parsed = fromLooseJSON(await navigator.clipboard.readText());

      // 无法配对的事件会被 L1 丢弃。丢弃是静默的，而这条路径导入完就切屏了、
      // 事后看不到任何提示，所以这里必须**导入前**让用户知道。
      const orphans = analyze(parsed, todayStr()).exclusions.orphan.length;
      if (orphans > 0) {
        setWarn({ events: parsed, orphans });
        return;
      }
      await replaceAll(parsed);
    } catch (err) {
      toast.show(clipboardErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const confirmWarnedImport = useCallback(async () => {
    const w = warn;
    setWarn(null);
    if (!w) return;
    try {
      await replaceAll(w.events);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    }
  }, [warn, toast]);

  return (
    <div className="empty">
      <Illustration />

      <h1 className="empty__title">还没有任何数据</h1>
      <p className="empty__body">
        记录第一次经期之后，日历上就会出现周期预测和易孕窗口。
      </p>

      <Button
        variant="dark"
        size="lg"
        className="empty__import"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        从备份导入（JSON）
      </Button>
      <Button variant="outline" size="lg" className="empty__start" onClick={onStart}>
        现在开始记录
      </Button>

      <section className="empty__migrate">
        <span className="empty__migrate-label">从别的 app 迁移过来</span>

        <div className="empty__step">
          <p className="empty__step-text">
            ① 复制提示词发给 AI，让它读
            <br />
            你在别的 app 里的截图或数据文件
          </p>
          <Button
            variant="soft"
            size="sm"
            className="empty__step-btn"
            disabled={busy}
            onClick={copyPrompt}
          >
            复制提示词
          </Button>
        </div>

        <div className="empty__step">
          <p className="empty__step-text">
            ② 把 AI 输出的 JSON 整段复制，
            <br />
            回来点这个按钮
          </p>
          <Button
            variant="soft"
            size="sm"
            className="empty__step-btn"
            disabled={busy}
            onClick={importFromClipboard}
          >
            从剪贴板导入
          </Button>
        </div>
      </section>

      <div className="empty__privacy">
        <span>数据只保存在这台设备上，不会上传到任何地方</span>
        <span>日历法推算仅供参考，不保证避孕效果</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onPickFile}
      />

      <ConfirmSheet
        open={warn !== null}
        title={warn ? `有 ${warn.orphans} 条记录无法配对` : ""}
        body="Moon 只记录成对的「来」和「走」。找不到配对的那几条会被忽略，其余的照常导入。"
        confirmLabel="仍要导入"
        onCancel={() => setWarn(null)}
        onConfirm={confirmWarnedImport}
      />

      <Toast message={toast.message} />
    </div>
  );
}