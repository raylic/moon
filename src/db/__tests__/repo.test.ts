/**
 * M3 写路径测试 —— `appendEvent` / `undoLast` / `replaceAll` / `clearAll`。
 *
 * 这是全应用**唯一的写入口**（plan §4.4：主按钮是唯一写入口），
 * 所以它的交互层约束必须被钉住。用 `fake-indexeddb` 在 node 里跑真 Dexie，
 * 而不是 mock —— 复合主键 `[date+type]` 的 put / delete 语义只有真实现才能验。
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayStr } from "../../lib/date";
import type { PeriodEvent } from "../../lib/cycle/types";
import { appendEvent, clearAll, replaceAll, undoLast } from "../index";
import { db } from "../schema";
import { cmpEvents } from "../io";

const TODAY = todayStr();
const D = (n: number) => addDays(TODAY, -n);

/** 直接读原始表（绕过排序），用来验「数据层到底存了什么」。 */
const raw = () => db.events.toArray();

beforeEach(async () => {
  await clearAll();
});

describe("appendEvent —— 交互层约束 C1/C2/C3", () => {
  it("空表第一条只能是 start", async () => {
    await expect(appendEvent({ date: TODAY, type: "end" })).rejects.toThrow(
      "还没有任何记录",
    );
    expect(await raw()).toHaveLength(0);
  });

  it("C1：type 必须与栈顶相反（连续两次「来」被挡住，且不写入）", async () => {
    await appendEvent({ date: D(10), type: "start" });
    await expect(appendEvent({ date: D(9), type: "start" })).rejects.toThrow(
      "上一条是「来」",
    );
    expect(await raw()).toHaveLength(1);
    await appendEvent({ date: D(9), type: "end" });
    await expect(appendEvent({ date: D(8), type: "end" })).rejects.toThrow(
      "上一条是「走」",
    );
    expect(await raw()).toHaveLength(2);
  });

  it("C2：日期不能早于栈顶，但**同一天**合法（≥ 不是 >）", async () => {
    await appendEvent({ date: D(10), type: "start" });
    await expect(appendEvent({ date: D(11), type: "end" })).rejects.toThrow(
      "不能早于上一条",
    );
    // 同一天先「来」再「走」= 一天经期，必须允许
    await appendEvent({ date: D(10), type: "end" });
    expect(await raw()).toHaveLength(2);
  });

  it("C3：不能记未来", async () => {
    await expect(
      appendEvent({ date: addDays(TODAY, 1), type: "start" }),
    ).rejects.toThrow("未来的日期");
    expect(await raw()).toHaveLength(0);
  });

  it("I1：非法日期被挡住", async () => {
    await expect(
      appendEvent({ date: "2026-02-30", type: "start" }),
    ).rejects.toThrow("日期不合法");
  });
});

describe("undoLast —— C4 等价 pop", () => {
  it("空表 no-op，不抛", async () => {
    await expect(undoLast()).resolves.toBeUndefined();
    expect(await raw()).toHaveLength(0);
  });

  it("每次删掉栈顶（按复合主键），顺序正确", async () => {
    await appendEvent({ date: D(10), type: "start" });
    await appendEvent({ date: D(5), type: "end" });
    await undoLast();
    expect(await raw()).toEqual([{ date: D(10), type: "start" }]);
    await undoLast();
    expect(await raw()).toHaveLength(0);
  });

  it("同一天的 start + end 能被逐个撤销（复合主键删得准）", async () => {
    await appendEvent({ date: D(3), type: "start" });
    await appendEvent({ date: D(3), type: "end" });
    await undoLast();
    expect(await raw()).toEqual([{ date: D(3), type: "start" }]);
  });
});

describe("replaceAll —— 整体覆盖，绕过 C1–C3 但守 I1–I3", () => {
  it("覆盖而不是追加", async () => {
    await appendEvent({ date: D(10), type: "start" });
    await replaceAll([
      { date: D(40), type: "start" },
      { date: D(35), type: "end" },
    ]);
    expect(await raw()).toHaveLength(2);
  });

  it("接受不交替的数据（导入不受栈规则限制），并规范化排序", async () => {
    const messy: PeriodEvent[] = [
      { date: D(5), type: "start" },
      { date: D(20), type: "start" },
      { date: D(10), type: "start" },
      { date: D(10), type: "end" }, // 同日 start 必须排在 end 前
      { date: D(20), type: "start" }, // 重复，被去重
    ];
    await replaceAll(messy);
    const rows = (await raw()).sort(cmpEvents);
    expect(rows).toEqual([
      { date: D(20), type: "start" },
      { date: D(10), type: "start" },
      { date: D(10), type: "end" },
      { date: D(5), type: "start" },
    ]);
  });

  it("非法项被过滤掉，不写入", async () => {
    await replaceAll([
      { date: "2026-02-30", type: "start" },
      { date: "2026-9-4", type: "start" },
      { date: D(10), type: "start" },
    ] as PeriodEvent[]);
    expect(await raw()).toEqual([{ date: D(10), type: "start" }]);
  });

  it("空数组 = 清空", async () => {
    await appendEvent({ date: D(10), type: "start" });
    await replaceAll([]);
    expect(await raw()).toHaveLength(0);
  });
});

describe("读出的顺序 —— 同日 start 必须在 end 之前", () => {
  it("复合主键的索引序是 end < start，所以必须重排（这是最容易漏的一个坑）", async () => {
    // 经 replaceAll 写入，绕开 C2 的限制，直接构造同日两条
    await replaceAll([
      { date: D(3), type: "start" },
      { date: D(3), type: "end" },
    ]);
    // 原始表按复合主键索引序读出来是 [end, start]（"end" < "start"）
    const forced = await db.events.orderBy(":id").toArray();
    expect(forced.map((e) => e.type)).toEqual(["end", "start"]);
    // 而 cmpEvents 把它规范成 [start, end]
    expect((await raw()).sort(cmpEvents).map((e) => e.type)).toEqual([
      "start",
      "end",
    ]);
  });
});