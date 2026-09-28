import Button from "./Button";
import "./ui.css";

/**
 * M4 — 确认弹层。画布 `反馈组件一览` ③④：
 * 310 宽 / r20 / padding 22 / gap 18；标题 16px 600，正文 12px `--text-dim` 行高 1.5；
 * 两个按钮各 128×46（r23、13px），间距 10。
 *
 * ⚠️ 画布上的弹层是脱离页面单独画的，没有画遮罩。模态必须有遮罩挡住底层点击，
 * 所以这里补了一层 `rgba(46,42,43,.28)` 的 scrim（画布没规定，我按最小可见度取的）。
 */
export interface ConfirmSheetProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 危险操作（清空所有数据）→ 确认键用 --danger，否则用中性深色 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <p className="sheet__body">{body}</p>
        </div>
        <div className="sheet__btns">
          <Button size="sm" variant="outline" block onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" variant={danger ? "danger" : "dark"} block onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}