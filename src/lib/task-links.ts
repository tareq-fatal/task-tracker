// Pure dependency/blocker logic for TaskLink (v6 model). Unit-tested.
import type { TaskStatus, TaskLinkType } from "./enums";

export type BlockerLink = { type: TaskLinkType; linkedStatus: TaskStatus };

/**
 * A link seen from one task's perspective. `direction: "out"` = the task owns
 * the link (TaskLink.taskId), `"in"` = the link points at it (linkedTaskId).
 * `linkedStatus` is the status of the OTHER task.
 */
export type DirectedLink = {
  type: TaskLinkType;
  direction: "out" | "in";
  linkedStatus: TaskStatus;
};

function isOpen(status: TaskStatus): boolean {
  return status !== "Done" && status !== "Archived";
}

/**
 * "X DependsOn Y" and "Y Blocks X" are the same relationship written from the
 * two ends: both mean X waits for Y. A link blocks the viewing task when the
 * other side is still open AND the relationship points the right way.
 */
export function isBlockingLink(l: DirectedLink): boolean {
  if (!isOpen(l.linkedStatus)) return false;
  return (
    (l.type === "DependsOn" && l.direction === "out") ||
    (l.type === "Blocks" && l.direction === "in")
  );
}

/** A task is blocked from completion while any blocking link is open. */
export function isBlockedByLinks(links: DirectedLink[]): boolean {
  return links.some(isBlockingLink);
}

/**
 * Legacy shape (outgoing links only) — kept for callers that only look at a
 * task's own "DependsOn" links.
 */
export function isBlockedByOpenDeps(links: BlockerLink[]): boolean {
  return isBlockedByLinks(
    links.map((l) => ({ ...l, direction: "out" as const }))
  );
}

/** The open blockers (for messaging). */
export function openBlockers(links: BlockerLink[]): BlockerLink[] {
  return links.filter((l) =>
    isBlockingLink({ ...l, direction: "out" })
  );
}

/* ------------------------------------------------------------------ */
/* Cycle detection                                                     */
/* ------------------------------------------------------------------ */

/** Normalized dependency edge: `from` waits for `to`. */
export type DepEdge = { from: string; to: string };

/**
 * Map a TaskLink row to a normalized edge. "A DependsOn B" → A waits for B;
 * "A Blocks B" → B waits for A. Other link types carry no dependency.
 */
export function normalizeDependencyEdge(
  taskId: string,
  linkedTaskId: string,
  type: string
): DepEdge | null {
  if (type === "DependsOn") return { from: taskId, to: linkedTaskId };
  if (type === "Blocks") return { from: linkedTaskId, to: taskId };
  return null;
}

/**
 * Would adding `next` to `existing` close a dependency cycle (A→B→…→A)?
 * True when `next.to` can already reach `next.from` by following edges.
 */
export function wouldCreateDependencyCycle(
  existing: DepEdge[],
  next: DepEdge
): boolean {
  if (next.from === next.to) return true;

  const adjacency = new Map<string, string[]>();
  for (const e of existing) {
    const list = adjacency.get(e.from);
    if (list) list.push(e.to);
    else adjacency.set(e.from, [e.to]);
  }

  const stack = [next.to];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === next.from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adjacency.get(cur) ?? []) stack.push(n);
  }
  return false;
}
