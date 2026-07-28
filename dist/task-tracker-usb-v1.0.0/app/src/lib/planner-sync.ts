// Pure sync logic for MS Planner ⇆ Task Tracker. No I/O here (the Graph client
// lives in graph.ts); everything in this file is deterministic and unit-tested.

import type { TaskStatus, TaskPriority } from "./enums";

/** Minimal shape of a Graph Planner task we care about. */
export type GraphPlannerTask = {
  id: string;
  title: string;
  percentComplete: number; // 0 | 50 | 100 (Planner), any 0..100 tolerated
  priority: number; // Planner 0..10 (1 urgent, 3 important, 5 medium, 9 low)
  dueDateTime?: string | null;
  bucketId?: string | null;
};

/** Minimal local task shape used for diffing. */
export type LocalTaskLite = {
  id?: string;
  externalId?: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate?: Date | null;
  bucket?: string | null;
};

export type SyncDirection = "pull" | "push" | "two-way";

export function graphStatus(percentComplete: number): TaskStatus {
  if (percentComplete >= 100) return "Done";
  if (percentComplete <= 0) return "Todo";
  return "InProgress";
}

export function graphPriorityToLocal(p: number): TaskPriority {
  if (p <= 1) return "Critical";
  if (p <= 3) return "High";
  if (p <= 5) return "Medium";
  return "Low";
}

export function localStatusToPercent(status: TaskStatus): number {
  switch (status) {
    case "Done":
    case "Archived":
      return 100;
    case "InProgress":
      return 50;
    default:
      return 0;
  }
}

export function localPriorityToGraph(p: TaskPriority): number {
  switch (p) {
    case "Critical":
      return 1;
    case "High":
      return 3;
    case "Medium":
      return 5;
    default:
      return 9;
  }
}

/** A Graph task mapped into local Task fields (for create/update locally). */
export function graphTaskToLocal(
  gt: GraphPlannerTask,
  bucketName?: string | null
): Required<Pick<LocalTaskLite, "externalId" | "title" | "status" | "priority" | "progress">> & {
  dueDate: Date | null;
  bucket: string | null;
} {
  return {
    externalId: gt.id,
    title: gt.title,
    status: graphStatus(gt.percentComplete),
    priority: graphPriorityToLocal(gt.priority),
    progress: Math.max(0, Math.min(100, Math.round(gt.percentComplete))),
    dueDate: gt.dueDateTime ? new Date(gt.dueDateTime) : null,
    bucket: bucketName ?? null,
  };
}

/** Local task → a Graph PATCH body (for push). */
export function localTaskToGraphPatch(local: LocalTaskLite): {
  title: string;
  percentComplete: number;
  priority: number;
} {
  return {
    title: local.title,
    percentComplete: localStatusToPercent(local.status),
    priority: localPriorityToGraph(local.priority),
  };
}

function meaningfullyDiffers(local: LocalTaskLite, mapped: ReturnType<typeof graphTaskToLocal>): boolean {
  return (
    local.title !== mapped.title ||
    local.status !== mapped.status ||
    local.priority !== mapped.priority ||
    local.progress !== mapped.progress
  );
}

export type SyncPlan = {
  createLocal: ReturnType<typeof graphTaskToLocal>[];
  updateLocal: Array<{ id: string } & ReturnType<typeof graphTaskToLocal>>;
  pushRemote: Array<{ graphTaskId: string; patch: ReturnType<typeof localTaskToGraphPatch> }>;
  createRemote: LocalTaskLite[];
};

/**
 * Compute what to change given the remote (Planner) and local task sets.
 * Tasks are matched by externalId (= Graph task id). Conflict policy for
 * "two-way" is remote-authoritative (Planner wins) on a matched pair.
 */
export function diffPlannerTasks(
  remote: GraphPlannerTask[],
  local: LocalTaskLite[],
  direction: SyncDirection,
  bucketNames: Record<string, string> = {}
): SyncPlan {
  const plan: SyncPlan = { createLocal: [], updateLocal: [], pushRemote: [], createRemote: [] };
  const localByExt = new Map(
    local.filter((l) => l.externalId).map((l) => [l.externalId as string, l])
  );

  for (const r of remote) {
    const mapped = graphTaskToLocal(r, r.bucketId ? bucketNames[r.bucketId] : null);
    const l = localByExt.get(r.id);
    if (!l) {
      if (direction !== "push") plan.createLocal.push(mapped);
      continue;
    }
    if (!meaningfullyDiffers(l, mapped)) continue;
    if (direction === "push") {
      plan.pushRemote.push({ graphTaskId: r.id, patch: localTaskToGraphPatch(l) });
    } else {
      // pull and two-way: Planner is authoritative on a matched conflict
      plan.updateLocal.push({ id: l.id as string, ...mapped });
    }
  }

  if (direction !== "pull") {
    for (const l of local) {
      if (!l.externalId) plan.createRemote.push(l);
    }
  }

  return plan;
}
