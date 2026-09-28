/**
 * M3 — io 纯函数单测。node 环境，完全不碰 IndexedDB / Dexie。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PeriodEvent } from "../../lib/cycle/types";
import { BACKUP_VERSION, backupFileName, fromJSON, toJSON } from "../io";

/** 拼一个带时区偏移的 ISO 串（与实现无关，用于断言）。 */
function offsetSuffix(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

const wrap = (events: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "moon.period-log",
    version: 1,
    exportedAt: "2026-09-28T10:12:00+08:00",
    events,
    ...extra,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("backupFileName / BACKUP_VERSION", () => {
  it("文件名带日期后缀", () => {
    expect(backupFileName("2026-09-28")).toBe("moon-backup-2026-09-28.json");
  });

  it("当前版本是 1", () => {
    expect(BACKUP_VERSION).toBe(1);
  });
});

describe("toJSON", () => {
  it("外壳字段齐全", () => {
    const ev: PeriodEvent[] = [{ date: "2026-09-01", type: "start" }];
    const obj = JSON.parse(toJSON(ev));
    expect(obj.format).toBe("moon.period-log");
    expect(obj.version).toBe(1);
    expect(obj.events).toEqual(ev);
  });

  it("exportedAt 带本地时区偏移、不带 Z，且能解析回同一时刻", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 8, 28, 10, 12, 0);
    vi.setSystemTime(now);

    const obj = JSON.parse(toJSON([]));
    expect(obj.exportedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
    expect(String(obj.exportedAt).endsWith("Z")).toBe(false);
    expect(new Date(obj.exportedAt).getTime()).toBe(now.getTime());
    expect(String(obj.exportedAt).endsWith(offsetSuffix(now))).toBe(true);
  });
});

describe("fromJSON — 往返", () => {
  it("round-trip 一致", () => {
    const events: PeriodEvent[] = [
      { date: "2026-08-01", type: "start" },
      { date: "2026-08-05", type: "end" },
      { date: "2026-08-29", type: "start" },
      { date: "2026-09-02", type: "end" },
    ];
    expect(fromJSON(toJSON(events))).toEqual(events);
  });

  it("同日 start 与 end 的往返", () => {
    const events: PeriodEvent[] = [
      { date: "2026-09-10", type: "start" },
      { date: "2026-09-10", type: "end" },
    ];
    expect(fromJSON(toJSON(events))).toEqual(events);
  });
});

describe("fromJSON — 拒绝坏输入", () => {
  it("非 JSON", () => {
    expect(() => fromJSON("这不是 json")).toThrow(Error);
    expect(() => fromJSON("")).toThrow(Error);
  });

  it("不是对象（数字 / null）", () => {
    expect(() => fromJSON("42")).toThrow(Error);
    expect(() => fromJSON("null")).toThrow(Error);
  });

  it("不接受裸数组，且说明期望格式", () => {
    expect(() =>
      fromJSON(JSON.stringify([{ date: "2026-09-01", type: "start" }])),
    ).toThrow(/moon\.period-log/);
  });

  it("坏 format", () => {
    expect(() => fromJSON(wrap([], { format: "other.app" }))).toThrow(
      /moon\.period-log/,
    );
  });

  it("坏 version", () => {
    expect(() => fromJSON(wrap([], { version: 2 }))).toThrow(/版本/);
    expect(() => fromJSON(wrap([], { version: "1" }))).toThrow(/版本/);
  });

  it("events 不是数组", () => {
    expect(() => fromJSON(wrap({}))).toThrow(/events/);
    expect(() => fromJSON(wrap("nope"))).toThrow(/events/);
  });

  it("非法 date：2026-02-30（不存在的日历日）", () => {
    expect(() =>
      fromJSON(wrap([{ date: "2026-02-30", type: "start" }])),
    ).toThrow(/2026-02-30/);
  });

  it("非法 date：2026-9-4（未补零）", () => {
    expect(() =>
      fromJSON(wrap([{ date: "2026-9-4", type: "start" }])),
    ).toThrow(Error);
  });

  it("非法 date：带时间戳的串也不行", () => {
    expect(() =>
      fromJSON(wrap([{ date: "2026-09-04T00:00:00Z", type: "start" }])),
    ).toThrow(Error);
  });

  it("非法 type", () => {
    expect(() =>
      fromJSON(wrap([{ date: "2026-09-01", type: "begin" }])),
    ).toThrow(/start/);
    expect(() => fromJSON(wrap([{ date: "2026-09-01" }]))).toThrow(Error);
  });
});

describe("fromJSON — 规范化", () => {
  it("重复 (date,type) 去重", () => {
    const out = fromJSON(
      wrap([
        { date: "2026-09-01", type: "start" },
        { date: "2026-09-01", type: "start" },
        { date: "2026-09-05", type: "end" },
        { date: "2026-09-05", type: "end" },
      ]),
    );
    expect(out).toEqual([
      { date: "2026-09-01", type: "start" },
      { date: "2026-09-05", type: "end" },
    ]);
  });

  it("乱序输入排成 date 升序", () => {
    const out = fromJSON(
      wrap([
        { date: "2026-09-05", type: "end" },
        { date: "2026-08-01", type: "start" },
        { date: "2026-08-28", type: "start" },
        { date: "2026-09-01", type: "end" },
      ]),
    );
    expect(out.map((e) => e.date)).toEqual([
      "2026-08-01",
      "2026-08-28",
      "2026-09-01",
      "2026-09-05",
    ]);
  });

  it("同日 end 在 start 之前的输入被规范化为 start 在前", () => {
    const out = fromJSON(
      wrap([
        { date: "2026-09-10", type: "end" },
        { date: "2026-09-10", type: "start" },
      ]),
    );
    expect(out).toEqual([
      { date: "2026-09-10", type: "start" },
      { date: "2026-09-10", type: "end" },
    ]);
  });
});