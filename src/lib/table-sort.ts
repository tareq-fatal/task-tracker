// Pure client-side sorting for the List view. Unit-tested.
export type SortKey = "title" | "status" | "priority" | "dueDate" | "storyPoints" | "assignee" | "tags";
export type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { Todo: 0, InProgress: 1, Done: 2, Archived: 3 };
const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export type SortableRow = {
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  storyPoints?: number | null;
  assignedTo?: { name: string } | null;
  tags?: string[];
};

function value(r: SortableRow, key: SortKey): number | string {
  switch (key) {
    case "title": return r.title.toLowerCase();
    case "status": return STATUS_ORDER[r.status] ?? 99;
    case "priority": return PRIORITY_ORDER[r.priority] ?? 99;
    case "storyPoints": return r.storyPoints ?? -1;
    case "assignee": return (r.assignedTo?.name ?? "￿").toLowerCase(); // unassigned last
    // Nach dem ersten Schlagwort (alphabetisch) - so stehen gleiche Themen
    // beieinander; Aufgaben ohne Schlagwort zuletzt.
    case "tags": return [...(r.tags ?? [])].sort()[0] ?? "￿";
    case "dueDate": return r.dueDate ? new Date(r.dueDate).getTime() : Number.POSITIVE_INFINITY; // no-date last
  }
}

/** Stable sort by column + direction (returns a new array). */
export function sortTasks<T extends SortableRow>(rows: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => [r, i] as const)
    .sort(([a, ai], [b, bi]) => {
      const va = value(a, key), vb = value(b, key);
      if (va < vb) return -1 * sign;
      if (va > vb) return 1 * sign;
      return ai - bi; // stable
    })
    .map(([r]) => r);
}
