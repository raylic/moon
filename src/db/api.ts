/**
 * M3 — 存储模块的**接口契约（文档性质）**。
 *
 * 这个文件只有 `declare`，没有实现，也**没有任何模块 import 它**。
 * 它的作用是：把 M3 对外的语义固定成可被 tsc 检查的文本，方便对照实现。
 * 真正的实现在 `repo.ts` / `io.ts`，由 `index.ts` 统一导出；
 * 其他模块一律 `import { ... } from "../db"`。
 *
 * 分层纪律：M3 **不碰算法**（L1 配对、统计、预测全在 M2），
 * M3 与 M2 的唯一耦合是 `PeriodEvent` 这个**类型**，运行时零耦合。
 */

import type { DateStr, PeriodEvent } from "../lib/cycle/types";

/**
 * 实时订阅全部事件。
 * - 按 `date` 升序；同一日期 `start` 必在 `end` 之前
 *   （注意：Dexie 复合主键 `[date+type]` 的索引序是 `"end" < "start"`，**不能**直接用，必须重排）
 * - 加载中返回 `undefined`（视图据此渲染空白）
 */
export declare function useEvents(): PeriodEvent[] | undefined;

/**
 * 追加一条事件（栈顶写入，唯一写入口）。违反交互层约束则**抛中文 Error 且不写入**：
 *   C1 新事件 type 必须与栈顶相反（栈空只能 start）
 *   C2 新事件 date ≥ 栈顶 date（**≥ 不是 >**，同一天先「来」再「走」合法）
 *   C3 date ≤ today
 * 校验与写入在同一个 Dexie 事务里，避免并发写入读到同一个旧栈顶。
 */
export declare function appendEvent(e: PeriodEvent): Promise<void>;

/** 撤销最后一条（等价 pop）。栈空时 no-op。 */
export declare function undoLast(): Promise<void>;

/**
 * 整体覆盖导入（`clear()` + `bulkPut()` 在一个事务里完成，调用方不需要自己管事务）。
 * **绕过 C1–C3，只施加数据层 I1–I3**（过滤非法项、按 `(date,type)` 去重、排序）。
 */
export declare function replaceAll(events: PeriodEvent[]): Promise<void>;

/** 清空全部数据。 */
export declare function clearAll(): Promise<void>;

/**
 * 导出为 JSON 字符串（plan §2.6 外壳）：
 * `{ format: "moon.period-log", version: 1, exportedAt, events }`
 * `exportedAt` 是**带本地时区偏移**的 ISO 串（不是 UTC 的 `Z`）；
 * `events` 先经 I1–I3 规范化，保证导出 → 导入稳定。
 */
export declare function toJSON(events: PeriodEvent[]): string;

/**
 * 解析备份 JSON → 规范化后的事件列表（L0 结构校验）。
 * 必须拒绝：非 JSON / 裸数组 / format 不匹配 / version 不认识 / events 非数组 /
 * 存在非法 date 或非法 type。失败 **抛中文 Error（可直接展示）**。
 */
export declare function fromJSON(text: string): PeriodEvent[];

/**
 * **宽容解析**（只给「读剪贴板」那条路径用，文件导入仍然用 `fromJSON`）。
 * 额外做两件事，都是为了让「让 AI 转格式 → 复制 → 粘回来」能用：
 * 1. 自动剥掉 ```json 代码块围栏、切掉前后夹带的说明文字
 * 2. 接受裸事件数组、也接受 `{"events":[...]}`（忽略 format / version）
 * 事件条目本身仍严格校验；解析出 0 条也报错。失败抛中文 Error。
 */
export declare function fromLooseJSON(text: string): PeriodEvent[];

/** 备份文件里 `version` 的当前值。 */
export declare const BACKUP_VERSION: number;

/** 导出文件名，如 `moon-backup-2026-09-28.json`。 */
export declare function backupFileName(today: DateStr): string;