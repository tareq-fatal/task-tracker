// Pure, testable task-filter logic shared by the FilterBar and every page.
import { TASK_PRIORITIES, type TaskStatus } from "./enums";

export type StatusGroup = "backlog" | "open" | "done" | "archived";
export type DateRangeKey = "today" | "week" | "month" | "custom";

/** Status-group → concrete task statuses (ANDed into the query). */
export const STATUS_GROUPS: Record<StatusGroup, TaskStatus[]> = {
  backlog: ["Todo"],
  open: ["Todo", "InProgress"],
  done: ["Done"],
  archived: ["Archived"],
};

export const STATUS_GROUP_KEYS = Object.keys(STATUS_GROUPS) as StatusGroup[];

export type TaskFilters = {
  project?: string;
  team?: string;
  assignees: string[]; // multi-select
  status?: StatusGroup;
  priority?: string;
  date?: DateRangeKey;
  from?: string; // yyyy-mm-dd (custom)
  to?: string; // yyyy-mm-dd (custom)
  q?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : undefined;
}

export function parseTaskFilters(sp: RawParams): TaskFilters {
  const assigneeRaw = str(sp.assignee);
  const status = str(sp.status);
  const date = str(sp.date);
  const priority = str(sp.priority);
  return {
    project: str(sp.project),
    team: str(sp.team),
    assignees: assigneeRaw ? assigneeRaw.split(",").filter(Boolean) : [],
    status: STATUS_GROUP_KEYS.includes(status as StatusGroup)
      ? (status as StatusGroup)
      : undefined,
    priority:
      priority && (TASK_PRIORITIES as readonly string[]).includes(priority)
        ? priority
        : undefined,
    date: (["today", "week", "month", "custom"] as DateRangeKey[]).includes(
      date as DateRangeKey
    )
      ? (date as DateRangeKey)
      : undefined,
    from: str(sp.from),
    to: str(sp.to),
    q: str(sp.q),
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Resolve a date-range filter to {gte,lte} (applied to dueDate). */
export function dateRangeFor(
  filters: Pick<TaskFilters, "date" | "from" | "to">,
  now: Date = new Date()
): { gte?: Date; lte?: Date } | null {
  switch (filters.date) {
    case "today":
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case "week": {
      // ISO week: Monday → Sunday
      const day = (now.getDay() + 6) % 7; // 0 = Monday
      const monday = startOfDay(new Date(now));
      monday.setDate(monday.getDate() - day);
      const sunday = endOfDay(new Date(monday));
      sunday.setDate(sunday.getDate() + 6);
      return { gte: monday, lte: sunday };
    }
    case "month": {
      const first = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const last = endOfDay(
        new Date(now.getFullYear(), now.getMonth() + 1, 0)
      );
      return { gte: first, lte: last };
    }
    case "custom": {
      const out: { gte?: Date; lte?: Date } = {};
      if (filters.from) {
        const f = new Date(filters.from);
        if (!Number.isNaN(f.getTime())) out.gte = startOfDay(f);
      }
      if (filters.to) {
        const tt = new Date(filters.to);
        if (!Number.isNaN(tt.getTime())) out.lte = endOfDay(tt);
      }
      return out.gte || out.lte ? out : null;
    }
    default:
      return null;
  }
}

/** Build a Prisma `where` from filters (all ANDed). */
export function buildTaskWhere(
  filters: TaskFilters,
  now: Date = new Date()
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.project) where.projectId = filters.project;
  if (filters.team) where.teamId = filters.team;
  if (filters.assignees.length === 1) {
    where.assignedToUserId = filters.assignees[0];
  } else if (filters.assignees.length > 1) {
    where.assignedToUserId = { in: filters.assignees };
  }
  if (filters.status) where.status = { in: STATUS_GROUPS[filters.status] };
  if (filters.priority) where.priority = filters.priority;

  const range = dateRangeFor(filters, now);
  if (range) where.dueDate = range;

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { description: { contains: filters.q } },
    ];
  }
  return where;
}

/** Number of active filter facets (for the result chip / "clear" affordance). */
export function activeFilterCount(filters: TaskFilters): number {
  let n = 0;
  if (filters.project) n++;
  if (filters.team) n++;
  if (filters.assignees.length) n++;
  if (filters.status) n++;
  if (filters.priority) n++;
  if (filters.date) n++;
  if (filters.q) n++;
  return n;
}

/** Serialize filters back into URLSearchParams (omitting empties). */
export function filtersToParams(filters: TaskFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.project) sp.set("project", filters.project);
  if (filters.team) sp.set("team", filters.team);
  if (filters.assignees.length) sp.set("assignee", filters.assignees.join(","));
  if (filters.status) sp.set("status", filters.status);
  if (filters.priority) sp.set("priority", filters.priority);
  if (filters.date) sp.set("date", filters.date);
  if (filters.date === "custom") {
    if (filters.from) sp.set("from", filters.from);
    if (filters.to) sp.set("to", filters.to);
  }
  if (filters.q) sp.set("q", filters.q);
  return sp;
}
