/**
 * M3 — 备份的序列化 / 反序列化。**纯函数，不碰 IndexedDB。**
 *
 * 另外这里放两个被 `repo.ts` 复用的纯工具：
 *  - `cmpEvents`：全模块唯一的排序规则（同日 start 在 end 之前）
 *  - `normalizeEvents`：I1–I3 级别的规范化（过滤非法项、去重、排序）
 */

import { isDateStr } from "../lib/date";
import type { DateStr, PeriodEvent } from "../lib/cycle/types";

/** 备份外壳的 format 标识。 */
export const BACKUP_FORMAT = "moon.period-log";

/** 备份文件里 `version` 的当前值。 */
export const BACKUP_VERSION = 1;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * 事件排序：date 升序；同一日期 start 在 end 之前。
 *
 * 这是 dexie 复合主键 `[date+type]` 的索引序**不能**提供的语义
 * （索引会按 `"end" < "start"` 的字典序排），所以读出来必须再排一次。
 */
export function cmpEvents(a: PeriodEvent, b: PeriodEvent): number {
  return a.date < b.date
    ? -1
    : a.date > b.date
      ? 1
      : a.type === b.type
        ? 0
        : a.type === "start"
          ? -1
          : 1;
}

/** 运行时的形状校验（I1 + type 合法性）。 */
function isEventLike(x: unknown): x is PeriodEvent {
  if (typeof x !== "object" || x === null) return false;
  const o = x as { date?: unknown; type?: unknown };
  return isDateStr(o.date) && (o.type === "start" || o.type === "end");
}

/**
 * I1–I3 规范化：丢掉非法项、按 `(date,type)` 去重、按 `cmpEvents` 升序稳定排序。
 * **不施加交互层约束 C1–C3**（导入本来就绕过它们，见 plan §2.3）。
 */
export function normalizeEvents(events: readonly unknown[]): PeriodEvent[] {
  const seen = new Set<string>();
  const out: PeriodEvent[] = [];
  for (const raw of events) {
    if (!isEventLike(raw)) continue;
    const key = `${raw.date}|${raw.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date: raw.date, type: raw.type });
  }
  out.sort(cmpEvents);
  return out;
}

/**
 * 本地时间 + 本地时区偏移的 ISO 串，如 `2026-09-28T10:12:00+08:00`。
 * **不能**用 `toISOString()`（那是 UTC 的 `Z`，会把「哪一天」漂移一天）。
 */
function localIso(d: Date): string {
  const offMin = -d.getTimezoneOffset(); // 东移为正
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}

/**
 * 导出为 JSON 字符串，外壳见 plan §2.6。
 * 导出前先规范化，保证「导出 → 导入」稳定（幂等），也让导出的文件本身干净可读。
 */
export function toJSON(events: PeriodEvent[]): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: localIso(new Date()),
      events: normalizeEvents(events),
    },
    null,
    2,
  );
}

const EXPECTED_SHAPE =
  '期望的格式是 { format: "moon.period-log", version: 1, exportedAt, events: [...] }';

/**
 * 逐条校验事件列表（L0 的条目部分）。`source` 只影响报错文案。
 * **严格**：date 必须是真实日历日，type 必须是 "start" / "end"。
 * 宽容解析只放宽「外壳」，不放宽这里 —— 拿到一个看不懂的 type 应该直接告诉用户，
 * 而不是猜一个映射默默改掉。
 */
function validateEventList(list: unknown[], source: string): PeriodEvent[] {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const at = `第 ${i + 1} 条`;
    if (typeof e !== "object" || e === null || Array.isArray(e)) {
      throw new Error(`${source}里${at}记录不是对象，无法导入。`);
    }
    const { date, type } = e as { date?: unknown; type?: unknown };
    if (!isDateStr(date)) {
      throw new Error(
        `${source}里${at}记录的日期不合法：${JSON.stringify(date)}（应为 YYYY-MM-DD 的真实日历日）。`,
      );
    }
    if (type !== "start" && type !== "end") {
      throw new Error(
        `${source}里${at}记录的类型不合法：${JSON.stringify(type)}（只能是 "start" 或 "end"）。`,
      );
    }
  }
  return normalizeEvents(list);
}

/** 解析备份 JSON → 规范化后的事件列表（L0 结构校验）。**严格**：只认标准外壳。失败抛中文 Error。 */
export function fromJSON(text: string): PeriodEvent[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON 文件，无法导入。");
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error(`备份文件格式不对：${EXPECTED_SHAPE}`);
  }
  if (Array.isArray(raw)) {
    // 裸事件数组不接收 —— 没有外壳就没法判断这是不是本应用的备份。
    // （剪贴板路径用 fromLooseJSON，那边接受裸数组。）
    throw new Error(`备份文件格式不对：不能是裸数组，${EXPECTED_SHAPE}`);
  }

  const obj = raw as Record<string, unknown>;

  if (obj.format !== BACKUP_FORMAT) {
    throw new Error(
      `这不是 Moon 的备份文件（format 应为 "${BACKUP_FORMAT}"，实际为 ${JSON.stringify(obj.format)}）。`,
    );
  }
  if (obj.version !== BACKUP_VERSION) {
    throw new Error(
      `备份文件版本不支持：只认识 version ${BACKUP_VERSION}，实际为 ${JSON.stringify(obj.version)}。`,
    );
  }
  if (!Array.isArray(obj.events)) {
    throw new Error("备份文件缺少 events 数组，或者 events 不是数组。");
  }

  return validateEventList(obj.events as unknown[], "备份文件");
}

/* ────────────────────────── 宽容解析（只给剪贴板用） ────────────────────────── */

/** 从一段文本里挖出第一个能 JSON.parse 成功的东西。 */
function extractPayload(text: string): unknown {
  const attempts: string[] = [];
  // AI 输出经常整段包在 ```json ... ``` 里；先试围栏里的内容
  const fenced = text.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (fenced && fenced[1].trim()) attempts.push(fenced[1].trim());
  attempts.push(text);

  for (const a of attempts) {
    const slices: string[] = [a];
    // 再试「第一个 { 到最后一个 }」和「第一个 [ 到最后一个 ]」（AI 常在前后加说明）
    for (const [open, close] of [
      ["{", "}"],
      ["[", "]"],
    ]) {
      const s = a.indexOf(open);
      const e = a.lastIndexOf(close);
      if (s !== -1 && e > s) slices.push(a.slice(s, e + 1));
    }
    for (const cand of slices) {
      try {
        return JSON.parse(cand) as unknown;
      } catch {
        /* 换下一个候选 */
      }
    }
  }
  throw new Error("剪贴板里找不到能解析的 JSON。");
}

/**
 * **宽容解析**：给「让 AI 转格式 → 复制 → 粘回来」这条路径用。
 *
 * 与 `fromJSON` 的区别只有两点，都是为了吸收 AI 输出的常见噪声：
 * 1. 自动剥掉 ```json 代码块围栏、切掉前后夹带的说明文字
 * 2. 接受裸事件数组、也接受 `{"events":[...]}`（**忽略 format / version**）
 *
 * 事件条目本身仍然严格校验（见 `validateEventList`），并且空结果直接报错 ——
 * 「宽容」是为了好用，不是为了把看不懂的东西默默塞进数据库。
 */
export function fromLooseJSON(text: string): PeriodEvent[] {
  const t = text.trim();
  if (!t) throw new Error("剪贴板是空的。");
  if (/^no_data$/i.test(t)) throw new Error("AI 说这份内容里没有可辨认的月经日期。");

  const raw = extractPayload(t);
  let events: PeriodEvent[];

  if (Array.isArray(raw)) {
    events = validateEventList(raw, "剪贴板内容");
  } else if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.events)) {
      throw new Error("剪贴板里的 JSON 里没有 events 数组。");
    }
    events = validateEventList(obj.events as unknown[], "剪贴板内容");
  } else {
    throw new Error("剪贴板里没有可导入的数据。");
  }

  if (events.length === 0) throw new Error("没有解析出任何经期记录。");
  return events;
}

/** 导出文件名，如 `moon-backup-2026-09-28.json`。 */
export function backupFileName(today: DateStr): string {
  return `moon-backup-${today}.json`;
}