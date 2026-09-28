import type { ReactNode } from "react";

/**
 * M4 — 表面卡片。白底 + 1px `--line` 描边。
 * 圆角不在组件里定死（记录模块 18 / 设置页数据卡 16 各不相同），由调用方的 className 指定。
 */
export interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps): JSX.Element {
  return <div className={className ? `card ${className}` : "card"}>{children}</div>;
}