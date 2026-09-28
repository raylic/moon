/**
 * 「复制提示词 → AI 转格式 → 粘回来」这条路径的**集成**测试。
 *
 * 覆盖 `EmptyView.importFromClipboard` 的逻辑部分（浏览器剪贴板 API 本身除外）：
 *   剪贴板文本 → fromLooseJSON → replaceAll → analyze
 *
 * 用真 Dexie（fake-indexeddb），因为这条链的终点是数据真的落盘、并算出预测。
 *
 * 最要紧的一条是最后一个 describe：它解释了为什么 `IMPORT_PROMPT` 里
 * 「看不到最后一天就按 5 天补 end」那条规则不能删。
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { analyze } from "../../lib/cycle";
import { addDays, todayStr } from "../../lib/date";
import { clearAll, fromLooseJSON, replaceAll } from "../index";
import { db } from "../schema";

const TODAY = todayStr();
const D = (n: number) => addDays(TODAY, -n);

beforeEach(async () => {
  await clearAll();
});

/** 模拟 AI 的典型输出：前后有说明、JSON 包在代码块里。 */
function aiStyleReply(events: { date: string; type: string }[]): string {
  const payload = {
    format: "moon.period-log",
    version: 1,
    exportedAt: "2026-09-28T10:12:00+08:00",
    events,
  };
  return [
    "好的，我从截图里读到了下面这些，已经按开始日期排好序了：",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "其中有一次只有开始日期、没有结束日期，我按 5 天补上了，不会影响周期计算。",
  ].join("\n");
}

describe("剪贴板导入全链路", () => {
  it("AI 风格输出（围栏 + 前后说明）→ 落盘 → 算出预测", async () => {
    // 造 4 个 28 天周期，每次 5 天
    const events: { date: string; type: string }[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = D(i * 28);
      events.push({ date: start, type: "start" });
      events.push({ date: addDays(start, 4), type: "end" });
    }

    const parsed = fromLooseJSON(aiStyleReply(events));
    expect(parsed).toHaveLength(8);

    // 导入前先照 EmptyView 的做法数一下孤立事件 —— 决定要不要弹确认弹层
    const orphans = analyze(parsed, TODAY).exclusions.orphan.length;
    expect(orphans).toBe(0); // → 不弹弹层，直接导入

    await replaceAll(parsed);
    const stored = await db.events.toArray();
    expect(stored).toHaveLength(8);

    const a = analyze(await db.events.toArray(), TODAY);
    expect(a.episodes).toHaveLength(4);
    expect(a.exclusions.orphan).toHaveLength(0);
    // 4 段经期 → 3 个完整周期，间隔都是 28 天
    expect(a.episodes.filter((e) => e.cycleLength !== null)).toHaveLength(3);
    expect(a.stats.center).toBe(28);
    // 最近一次经期首日是 TODAY（最后一个周期从今天开始）
    expect(a.lastStart).toBe(TODAY);
  });

  it("乱序 + 重复 + 异形日期的输入被规范化后再落盘", async () => {
    const text = aiStyleReply([
      { date: D(1), type: "end" },
      { date: D(1), type: "start" },
      { date: D(29), type: "start" },
      { date: D(25), type: "end" },
      { date: D(29), type: "start" },
    ]);
    const parsed = fromLooseJSON(text);
    await replaceAll(parsed);
    const rows = await db.events.toArray();
    expect(rows).toHaveLength(4);
    expect(rows.every((r, i) => i === 0 || rows[i - 1].date <= r.date)).toBe(true);
  });
});

describe("弹确认弹层的那条分支", () => {
  it("出现无法配对的事件 → orphans > 0（EmptyView 据此先弹确认再导入）", () => {
    // 开头一个孤立的 end：找不到配对的 start
    const text = aiStyleReply([
      { date: D(60), type: "end" },
      { date: D(30), type: "start" },
      { date: D(26), type: "end" },
    ]);
    const parsed = fromLooseJSON(text);
    const a = analyze(parsed, TODAY);
    expect(a.exclusions.orphan).toHaveLength(1);
    // 孤立的 end 不产生 Episode，但原始数据保留（不会被 normalizeEvents 丢掉）
    expect(parsed).toHaveLength(3);
    expect(a.episodes).toHaveLength(1);
  });
});

describe("为什么「看不到最后一天就补 end」这条规则不能删", () => {
  it("只输出 start 的历史会被栈配对丢掉大部分（这就是要补 end 的原因）", () => {
    // 模拟一个**没遵守规则 6** 的 AI：只从截图里读到了每次经期的第一天
    const startsOnly = [D(84), D(56), D(28), D(0)].map((date) => ({
      date,
      type: "start" as const,
    }));
    const a = analyze(startsOnly, TODAY);

    // 栈配对：每遇到一个新的 start，就把上一个 start 判为孤立事件丢弃
    expect(a.exclusions.orphan).toHaveLength(3);
    // 结果只剩最后一段「进行中」，3 个完整周期全丢了
    expect(a.episodes).toHaveLength(1);
    expect(a.episodes.filter((e) => e.cycleLength !== null)).toHaveLength(0);
    expect(a.stats.n).toBe(0);

    // 而按规则 6 补上 end 之后（周期长度只由 start→start 决定，补的 end 不影响预测）
    const withEnds = startsOnly.flatMap((s) => [
      s,
      { date: addDays(s.date, 4), type: "end" as const },
    ]);
    const b = analyze(withEnds, TODAY);
    expect(b.exclusions.orphan).toHaveLength(0);
    expect(b.episodes).toHaveLength(4);
    expect(b.episodes.filter((e) => e.cycleLength !== null)).toHaveLength(3);
    expect(b.stats.n).toBe(3);
    expect(b.stats.center).toBe(28);
  });
});