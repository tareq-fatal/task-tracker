// Pure issue-hierarchy logic — roll-up + parent-type validation. Unit-tested.
import type { TaskType, TaskStatus } from "./enums";

// Lower level = higher in the tree. Bug sits with Task.
const LEVEL: Record<TaskType, number> = {
  Epic: 0,
  Story: 1,
  Task: 2,
  Bug: 2,
  Subtask: 3,
};

/** A parent must be strictly higher in the hierarchy than its child. */
export function parentTypeAllowed(childType: TaskType, parentType: TaskType): boolean {
  return LEVEL[parentType] < LEVEL[childType];
}

export type RollupChild = {
  status: TaskStatus;
  progress: number;
  storyPoints?: number | null;
};

export type Rollup = {
  total: number;
  done: number;
  totalPoints: number;
  donePoints: number;
  progress: number; // 0-100, points-weighted when points exist, else by count
};

/** Aggregate children into an epic/story roll-up. */
export function rollup(children: RollupChild[]): Rollup {
  const total = children.length;
  const done = children.filter((c) => c.status === "Done").length;
  const totalPoints = children.reduce((a, c) => a + (c.storyPoints ?? 0), 0);
  const donePoints = children
    .filter((c) => c.status === "Done")
    .reduce((a, c) => a + (c.storyPoints ?? 0), 0);

  let progress = 0;
  if (totalPoints > 0) progress = Math.round((100 * donePoints) / totalPoints);
  else if (total > 0) progress = Math.round((100 * done) / total);

  return { total, done, totalPoints, donePoints, progress };
}

/**
 * Would setting `newParentId` as the parent of `taskId` create a cycle?
 * `parentOf` maps a task id to its current parent id (null = root).
 */
export function wouldCreateCycle(
  taskId: string,
  newParentId: string | null,
  parentOf: Map<string, string | null>
): boolean {
  if (!newParentId) return false;
  if (newParentId === taskId) return true;
  let cur: string | null | undefined = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === taskId) return true;
    if (seen.has(cur)) break; // guard against pre-existing loops
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}
