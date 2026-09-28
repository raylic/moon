import { useState } from "react";
import { useEvents } from "../db";
import MonthView from "../features/month/MonthView";
import YearView from "../features/year/YearView";
import SettingsView from "../features/settings/SettingsView";
import EmptyView from "../features/empty/EmptyView";
import TabBar, { type TabKey } from "../ui/TabBar";
import "./app.css";

/**
 * M9 — 应用壳。
 *
 * 刻意不引入路由库：只有 3 个 tab 且没有 URL 需求，`useState` 足够，
 * 少一个依赖、少一层 History 交互。见 DECISIONS.md D1。
 *
 * 空状态是**首启的门**（plan §4.1）：`events.length === 0` 时挡在 TabBar 之前，
 * 点「现在开始记录」进入月视图的空数据态。
 */
export default function App() {
  const events = useEvents();
  const [tab, setTab] = useState<TabKey>("month");
  const [entered, setEntered] = useState(false);

  // 加载中：不闪空状态，也不闪月视图
  if (events === undefined) return <div className="phone boot" aria-busy="true" />;

  if (events.length === 0 && !entered) {
    return (
      <div className="phone">
        <EmptyView onStart={() => setEntered(true)} />
      </div>
    );
  }

  return (
    <div className="phone">
      <main className="phone-body">
        <section className="pane" hidden={tab !== "month"}>
          <MonthView />
        </section>
        <section className="pane" hidden={tab !== "year"}>
          <YearView />
        </section>
        <section className="pane" hidden={tab !== "settings"}>
          <SettingsView />
        </section>
      </main>
      <TabBar value={tab} onChange={setTab} />
    </div>
  );
}