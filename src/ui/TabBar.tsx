import Icon, { type IconName } from "./Icon";
import "./ui.css";

/**
 * M4 — 底部 tab 栏。由 M9 应用壳渲染在 `.phone` 底部（视图里**不要**再渲染一次）。
 *
 * 画布：悬浮胶囊 350×52 / r26 / 白底 + `--line` 描边 / padding 4 / 段间距 4，
 * 左右各留 20、下方留 20。选中段深色 #2E2A2B（= `--text`）+ r22，
 * 内容为 15×15 图标 + 6 间距 + 13px 文案（选中 600 白字，未选中 `--text-dim`）。
 */
export type TabKey = "month" | "year" | "settings";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "month", label: "月视图", icon: "calendar-days" },
  { key: "year", label: "年视图", icon: "layout-grid" },
  { key: "settings", label: "设置", icon: "settings" },
];

export interface TabBarProps {
  value: TabKey;
  onChange: (t: TabKey) => void;
}

export default function TabBar({ value, onChange }: TabBarProps): JSX.Element {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={t.key === value ? "tabbar__seg tabbar__seg--on" : "tabbar__seg"}
          aria-current={t.key === value ? "page" : undefined}
          onClick={() => onChange(t.key)}
        >
          <Icon name={t.icon} size={15} />
          <span className="tabbar__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}