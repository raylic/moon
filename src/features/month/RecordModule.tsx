import type { StackState } from "../../lib/cycle/types";
import { formatCN, type DateStr } from "../../lib/date";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import "./month.css";

/**
 * M5 — 记录模块。画布 `记录模块状态一览` + `月视图 — 2026年9月`：
 * 白卡 r18 / padding 16 / gap 14，
 *   ① 顶部：左「当前状态」，右「上次记录」（右对齐）
 *   ② 1px 分隔线
 *   ③ 选中行：左 `已选中 …`，右提示 `点日历上的过去日期可补记`
 *   ④ 按钮行：主按钮（唯一写入口）+ 撤销
 *
 * 主按钮的文案 / 颜色只由「选中日期 × 栈顶状态」决定，见下面的 `mainLabel`。
 */
export interface RecordModuleProps {
  today: DateStr;
  /** null = 没有选中任何日期（再点同一格取消选中） */
  selected: DateStr | null;
  stack: StackState;
  onRecord: () => void;
  onUndo: () => void;
}

function stateText(stack: StackState): string {
  if (stack.top === null) return "还没有任何记录";
  if (stack.top.type === "start") return `经期进行中 · 第 ${stack.dayIndex ?? 1} 天`;
  return `距上次经期结束 ${stack.daysSinceEnd ?? 0} 天`;
}

function lastText(stack: StackState): string {
  if (stack.top === null) return "—";
  return `${formatCN(stack.top.date)} · ${stack.top.type === "start" ? "来了" : "走了"}`;
}

/** 画布三张样张：今天 → `已选中 今天 · 9月16日`；过去 → `已选中 9月4日 · 过去`。 */
function selText(selected: DateStr | null, today: DateStr): string {
  if (selected === null) return "";
  if (selected === today) return `已选中 今天 · ${formatCN(selected)}`;
  if (selected < today) return `已选中 ${formatCN(selected)} · 过去`;
  return `已选中 ${formatCN(selected)} · 未来`;
}

function mainLabel(selected: DateStr | null, today: DateStr, nextType: "start" | "end"): string {
  const verb = nextType === "start" ? "来月经" : "月经走了";
  if (selected === null || selected === today) return `记录今天${verb}`;
  return `补记 ${formatCN(selected)} ${verb}`;
}

export default function RecordModule({
  today,
  selected,
  stack,
  onRecord,
  onUndo,
}: RecordModuleProps): JSX.Element {
  const isFuture = selected !== null && selected > today;
  const recordsPeriod = stack.nextType === "start";

  return (
    <Card className="rm">
      <div className="rm__head">
        <div className="rm__state">
          <span className="rm__caption">当前状态</span>
          <span className="rm__state-value">{stateText(stack)}</span>
        </div>
        <div className="rm__last">
          <span className="rm__caption">上次记录</span>
          <span className="rm__last-value">{lastText(stack)}</span>
        </div>
      </div>

      <div className="rm__divider" />

      <div className="rm__sel">
        <span className="rm__sel-value">{selText(selected, today)}</span>
        <span className="rm__sel-hint">点日历上的过去日期可补记</span>
      </div>

      <div className="rm__btns">
        <Button
          variant={recordsPeriod ? "period" : "dark"}
          size="md"
          block
          disabled={selected === null || isFuture}
          onClick={onRecord}
          className="rm__main"
        >
          {mainLabel(selected, today, stack.nextType)}
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={stack.top === null}
          onClick={onUndo}
          className="rm__undo"
        >
          撤销
        </Button>
      </div>
    </Card>
  );
}