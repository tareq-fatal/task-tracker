// Pure dependency/blocker logic for TaskLink (v6 model). Unit-tested.
import type { TaskStatus, TaskLinkType } from "./enums";

export type BlockerLink = { type: TaskLinkType; linkedStatus: TaskStatus };

/**
 * A task is blocked from completion while any of its "DependsOn" links points to
 * a task that is not yet Done (or Archived). "Blocks" is the inverse direction
 * and is evaluated on the other task, so it's not considered here.
 */
export function isBlockedByOpenDeps(links: BlockerLink[]): boolean {
  return links.some(
    (l) =>
      l.type === "DependsOn" &&
      l.linkedStatus !== "Done" &&
      l.linkedStatus !== "Archived"
  );
}

/** The open blockers (for messaging). */
export function openBlockers(links: BlockerLink[]): BlockerLink[] {
  return links.filter(
    (l) =>
      l.type === "DependsOn" &&
      l.linkedStatus !== "Done" &&
      l.linkedStatus !== "Archived"
  );
}
