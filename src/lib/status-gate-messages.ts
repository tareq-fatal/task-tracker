import type { TKey } from "./i18n";

/** Map a status-change rejection (server action error code) to its i18n key.
 *  Shared by kanban board, status select and list bulk toolbar. */
export function statusGateMessageKey(error: string | undefined): TKey {
  switch (error) {
    case "BLOCKED":
      return "task.blocked";
    case "TARGET_LOCKED":
      return "task.targetLocked";
    case "TODOS_OPEN":
      return "task.todosOpen";
    case "TIME_REQUIRED":
      return "task.timeRequired";
    default:
      return "common.error";
  }
}
