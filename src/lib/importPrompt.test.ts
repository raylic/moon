/**
 * 提示词守卫测试。
 *
 * `IMPORT_PROMPT` 是一段**内容**，没有类型系统保护它。但里面的两条规则一旦被改掉，
 * 「从别的 app 迁移」这个功能就会坏掉（而且是静默地坏 —— 用户拿到一份格式合法的
 * 错误数据），所以值得拿测试钉住：
 *
 *   1. type 必须严格交替。Moon 的 L1 配对用栈，连续两个 start 会让**前一个 start
 *      被丢弃**（plan §3.3）。所以「看不到最后一天时怎么补 end」这条规则不能删。
 *   2. 只输出 JSON、不带代码块围栏。
 */

import { describe, expect, it } from "vitest";
import { IMPORT_PROMPT } from "./importPrompt";
import { fromLooseJSON } from "../db";

describe("IMPORT_PROMPT", () => {
  it("包含目标格式的标识和外壳字段", () => {
    expect(IMPORT_PROMPT).toContain("moon.period-log");
    expect(IMPORT_PROMPT).toContain('"version": 1');
    expect(IMPORT_PROMPT).toContain('"events"');
  });

  it("说明了只提取 start / end，并排除其它记录类型", () => {
    for (const t of ["start", "end"]) expect(IMPORT_PROMPT).toContain(`"${t}"`);
    expect(IMPORT_PROMPT).toContain("流量");
    expect(IMPORT_PROMPT).toContain("体温");
  });

  it("⚠️ 保留了「严格交替」这条硬规则", () => {
    expect(IMPORT_PROMPT).toContain("严格交替");
  });

  it("⚠️ 保留了「看不到最后一天就按 5 天补 end」这条兜底", () => {
    // 删掉这条 → AI 会只输出 start → 连续两个 start 让前一个被丢弃 → 整段历史丢失
    expect(IMPORT_PROMPT).toContain("第一天 + 4 天");
    expect(IMPORT_PROMPT).toMatch(/按 5 天算/);
  });

  it("禁止写未来日期、禁止猜测", () => {
    expect(IMPORT_PROMPT).toContain("未来的日期");
    expect(IMPORT_PROMPT).toContain("不要猜测");
  });

  it("要求只输出 JSON、不要代码块，并给出 NO_DATA 约定", () => {
    expect(IMPORT_PROMPT).toContain("不要用 Markdown 代码块包围");
    expect(IMPORT_PROMPT).toContain("NO_DATA");
  });

  it("自身不含反引号或模板占位符（否则会破坏模板字符串 / 诱导 AI 输出围栏）", () => {
    expect(IMPORT_PROMPT).not.toContain("`");
    expect(IMPORT_PROMPT).not.toContain("${");
  });

  it("给出的示例外壳能被宽容解析器直接吃掉（示例与解析器不会脱节）", () => {
    const shell = {
      format: "moon.period-log",
      version: 1,
      exportedAt: "2026-09-28T10:12:00+08:00",
      events: [
        { date: "2026-08-29", type: "start" },
        { date: "2026-09-02", type: "end" },
      ],
    };
    expect(fromLooseJSON(JSON.stringify(shell))).toHaveLength(2);
  });

  it("长度在合理范围（太短＝说不清，太长＝AI 容易丢要点）", () => {
    expect(IMPORT_PROMPT.length).toBeGreaterThan(300);
    expect(IMPORT_PROMPT.length).toBeLessThan(1400);
  });
});