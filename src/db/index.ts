/**
 * M3 — 存储模块的唯一公开入口。
 *
 * 签名与 `api.ts` 逐字一致（api.ts 是冻结的契约，不改）。其他模块一律 `import { ... } from "../db"`。
 * 这里额外把 `PeriodEvent` / `DateStr` / `EventType` 类型转出去，方便调用方只从一个入口取
 * （纯类型，运行时零耦合）。
 */

export type { DateStr, EventType, PeriodEvent } from "../lib/cycle/types";

export { useEvents, appendEvent, undoLast, replaceAll, clearAll } from "./repo";
export { BACKUP_VERSION, toJSON, fromJSON, fromLooseJSON, backupFileName } from "./io";