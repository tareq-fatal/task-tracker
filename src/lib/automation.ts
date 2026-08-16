// Basic task automation: pure rule matching. Unit-tested.
// A rule = WHEN <trigger> THEN <action>. One evaluation pass (no chaining), so
// an action never re-triggers another rule — keeps things predictable + loop-free.

export const TRIGGER_TYPES = ["status_to", "priority_to", "column_to", "created"] as const;
export const ACTION_TYPES = ["set_status", "set_priority", "assign_to"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type ActionType = (typeof ACTION_TYPES)[number];

export type Rule = {
  id: string;
  enabled: boolean;
  projectId: string | null; // null = all projects
  triggerType: string;
  triggerValue: string | null;
  actionType: string;
  actionValue: string;
};

export type AutoEvent = {
  type: TriggerType;
  value?: string; // the new status/priority (undefined for "created")
  projectId: string | null;
};

export type AppliedAction = { type: ActionType; value: string };

/** Actions to apply for an event, given the tenant's rules. Skips no-ops (an
 *  action that sets the very field/value that triggered it). */
export function matchingActions(rules: Rule[], event: AutoEvent): AppliedAction[] {
  const out: AppliedAction[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.triggerType !== event.type) continue;
    if (r.projectId && r.projectId !== event.projectId) continue;
    if (event.type !== "created" && r.triggerValue && r.triggerValue !== event.value) continue;

    // no-op guard: don't set the same field back to the triggering value
    const sameField =
      (event.type === "status_to" && r.actionType === "set_status") ||
      (event.type === "priority_to" && r.actionType === "set_priority") ||
      (event.type === "column_to" && r.actionType === "set_status");
    if (sameField && r.actionValue === event.value) continue;

    out.push({ type: r.actionType as ActionType, value: r.actionValue });
  }
  return out;
}
