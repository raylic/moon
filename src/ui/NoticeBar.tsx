import type { ReactNode } from "react";
import Icon from "./Icon";
import "./ui.css";

/**
 * M4 — 提示条。画布 `反馈组件一览` ②：
 * 玫红 8% 底 #E4576B14 + 20% 描边 #E4576B33 / r12 / padding 12×14 / gap 9，
 * 左侧 15×15 alert-circle（#C63F54），文字 12px #C63F54。
 */
export interface NoticeBarProps {
  children: ReactNode;
}

export default function NoticeBar({ children }: NoticeBarProps): JSX.Element {
  return (
    <div className="noticebar" role="status">
      <Icon name="alert-circle" size={15} className="noticebar__icon" />
      <p className="noticebar__text">{children}</p>
    </div>
  );
}