import type { ReactNode } from "react";

/**
 * M4 — 按钮。三种画布尺寸：
 *   sm  46 高 / r23 / 13px  —— 确认弹层里的「取消」「确认清空」
 *   md  48 高 / r24 / 14px  —— 记录模块的「记录今天来月经」「撤销」
 *   lg  50 高 / r25 / 14px  —— 空状态页的两个按钮
 */
export type ButtonVariant = "period" | "dark" | "outline" | "soft" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  children: ReactNode;
  /** period = 记为「来」的玫红；dark = 记为「走」的中性深色；outline = 白底描边；soft = 浅底无描边（卡片内的次级按钮）；danger = 清空数据 */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 撑满父容器宽度 */
  block?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function Button({
  children,
  variant = "outline",
  size = "md",
  block = false,
  disabled = false,
  onClick,
  className,
}: ButtonProps): JSX.Element {
  const cls = [
    "btn",
    `btn--${variant}`,
    `btn--${size}`,
    block ? "btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}