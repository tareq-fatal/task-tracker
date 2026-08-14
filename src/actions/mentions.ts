"use server";

import { requireTenant } from "@/lib/tenant";
import { mentionCandidates, type MentionCandidate } from "@/lib/mentions";

/**
 * Users the @-picker may offer on a task: everyone in the ACTIVE tenant who
 * can see this task, minus the author (mentioning yourself is a no-op — see
 * `notify`, which skips the actor). Returns [] for a task the caller can't
 * see, so the picker can never be used to enumerate a foreign tenant.
 */
export async function mentionCandidatesAction(
  taskId: string
): Promise<MentionCandidate[]> {
  const { user, tenant } = await requireTenant();
  const candidates = await mentionCandidates(taskId, tenant.id);
  // The caller must be on the task themselves — otherwise they get nothing.
  if (!candidates.some((c) => c.id === user.id)) return [];
  return candidates.filter((c) => c.id !== user.id);
}
