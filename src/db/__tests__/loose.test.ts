/**
 * `fromLooseJSON` —— 剪贴板路径的**宽容**解析。
 *
 * 这条路径的用户动作是「把 AI 的输出整段复制粘贴回来」，所以解析器要吸收两类噪声：
 * 代码块围栏、前后夹带的说明文字。但**事件条目本身仍然严格**，
 * 因为看不懂的 type 应该直接告诉用户，而不是猜一个映射默默改掉。
 *
 * 这里同时守住一条回归线：宽容**不能漏到文件导入路径**（`fromJSON` 仍然严格）。
 */

import { describe, expect, it } from "vitest";
import { fromJSON, fromLooseJSON } from "../index";
import type { PeriodEvent } from "../../lib/cycle/types";

const SHELL = {
  format: "moon.period-log",
  version: 1,
  exportedAt: "2026-09-28T10:12:00+08:00",
  events: [
    { date: "2026-08-29", type: "start" },
    { date: "2026-09-02", type: "end" },
  ],
};

const EXPECTED: PeriodEvent[] = [
  { date: "2026-08-29", type: "start" },
  { date: "2026-09-02", type: "end" },
];

describe("fromLooseJSON —— 吸收 AI 输出的噪声", () => {
  it("标准外壳原样通过", () => {
    expect(fromLooseJSON(JSON.stringify(SHELL))).toEqual(EXPECTED);
  });

  it("剥掉 ```json 代码块围栏", () => {
    const text = ["```json", JSON.stringify(SHELL, null, 2), "```"].join("\n");
    expect(fromLooseJSON(text)).toEqual(EXPECTED);
  });

  it("剥掉无语言标记的围栏", () => {
    expect(fromLooseJSON("```\n" + JSON.stringify(SHELL) + "\n```")).toEqual(EXPECTED);
  });

  it("切掉前后夹带的说明文字", () => {
    const text = `好的，我整理好了，这是结果：\n${JSON.stringify(SHELL)}\n以上共 2 条记录，请查收。`;
    expect(fromLooseJSON(text)).toEqual(EXPECTED);
  });

  it("围栏 + 前后说明文字，两层噪声同时存在", () => {
    const text = `这是结果：\n\`\`\`json\n${JSON.stringify(SHELL)}\n\`\`\`\n需要我再调整吗？`;
    expect(fromLooseJSON(text)).toEqual(EXPECTED);
  });

  it("接受裸事件数组（文件导入路径不接受）", () => {
    expect(fromLooseJSON(JSON.stringify(SHELL.events))).toEqual(EXPECTED);
  });

  it("接受只有 events 的对象（忽略 format / version）", () => {
    expect(fromLooseJSON(JSON.stringify({ events: SHELL.events }))).toEqual(EXPECTED);
  });

  it("format 写错但 events 有效 → 仍然接受（这就是宽容的意义）", () => {
    const bad = { ...SHELL, format: "some.other.app" };
    expect(fromLooseJSON(JSON.stringify(bad))).toEqual(EXPECTED);
  });

  it("规范化：排序 + 去重 + 同日 start 排到 end 前", () => {
    const messy = [
      { date: "2026-08-30", type: "end" },
      { date: "2026-08-30", type: "start" },
      { date: "2026-09-10", type: "start" },
      { date: "2026-09-10", type: "start" },
    ];
    expect(fromLooseJSON(JSON.stringify(messy))).toEqual([
      { date: "2026-08-30", type: "start" },
      { date: "2026-08-30", type: "end" },
      { date: "2026-09-10", type: "start" },
    ]);
  });
});

describe("fromLooseJSON —— 该报错的时候必须报错", () => {
  it("空的剪贴板", () => {
    expect(() => fromLooseJSON("   \n ")).toThrow("剪贴板是空的");
  });

  it("AI 回复 NO_DATA", () => {
    expect(() => fromLooseJSON("NO_DATA")).toThrow("没有可辨认的月经日期");
    expect(() => fromLooseJSON("no_data")).toThrow("没有可辨认的月经日期");
  });

  it("一段纯说明文字里没有 JSON", () => {
    expect(() => fromLooseJSON("抱歉，我看不清这张截图里的日期。")).toThrow(
      "找不到能解析的 JSON",
    );
  });

  it("events 是空数组 → 不产生空导入", () => {
    expect(() => fromLooseJSON(JSON.stringify({ events: [] }))).toThrow(
      "没有解析出任何经期记录",
    );
    expect(() => fromLooseJSON("[]")).toThrow("没有解析出任何经期记录");
  });

  it("非法的日期照旧拒绝（宽容只放宽外壳）", () => {
    expect(() =>
      fromLooseJSON(
        JSON.stringify({ events: [{ date: "2026-02-30", type: "start" }] }),
      ),
    ).toThrow("日期不合法");
  });

  it("看不懂的 type 照旧拒绝，并且把原值报出来", () => {
    expect(() =>
      fromLooseJSON(
        JSON.stringify({ events: [{ date: "2026-08-29", type: "period_start" }] }),
      ),
    ).toThrow('"period_start"');
  });

  it("对象里没有 events 数组", () => {
    expect(() => fromLooseJSON(JSON.stringify({ hello: "world" }))).toThrow(
      "没有 events 数组",
    );
  });
});

describe("回归：宽容不能漏到文件导入路径", () => {
  it("fromJSON 仍然拒绝裸数组", () => {
    expect(() => fromJSON(JSON.stringify(SHELL.events))).toThrow("不能是裸数组");
  });

  it("fromJSON 仍然拒绝代码块围栏（它要的是文件，不是聊天记录）", () => {
    expect(() =>
      fromJSON("```json\n" + JSON.stringify(SHELL) + "\n```"),
    ).toThrow("不是有效的 JSON");
  });

  it("fromJSON 仍然检查 format", () => {
    expect(() => fromJSON(JSON.stringify({ ...SHELL, format: "x" }))).toThrow(
      "这不是 Moon 的备份文件",
    );
  });

  it("同一份标准外壳，两条路径结果一致", () => {
    const text = JSON.stringify(SHELL);
    expect(fromLooseJSON(text)).toEqual(fromJSON(text));
  });
});