import { isAdminRole } from "./enums";

/** Reaction palette — order = picker order. */
export const REACTION_TYPES = ["thumbs_up", "seen", "heart", "check"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REACTION_EMOJI: Record<ReactionType, string> = {
  thumbs_up: "👍",
  seen: "👁",
  heart: "❤️",
  check: "✅",
};

export function isReactionType(v: string): v is ReactionType {
  return (REACTION_TYPES as readonly string[]).includes(v);
}

export type ReactionRow = { type: string; userId: string; userName: string };
export type ReactionChip = { type: ReactionType; count: number; mine: boolean; names: string[] };

/** Aggregate raw reaction rows into render-ready chips (picker order). */
export function aggregateReactions(rows: ReactionRow[], meId: string): ReactionChip[] {
  const out: ReactionChip[] = [];
  for (const type of REACTION_TYPES) {
    const of = rows.filter((r) => r.type === type);
    if (of.length === 0) continue;
    out.push({
      type,
      count: of.length,
      mine: of.some((r) => r.userId === meId),
      names: of.map((r) => r.userName),
    });
  }
  return out;
}

/** May this actor delete a comment/attachment? Admins: any in their tenant;
 *  everyone else: only their own. SubAdmin is deliberately NOT included —
 *  user management only, no content moderation. */
export function canDeleteContent(actorRole: string, isOwn: boolean): boolean {
  return isOwn || isAdminRole(actorRole);
}

/** Reaction notifications are deduped: repeated reactions on the same comment
 *  within this window produce no additional notification. */
export const REACTION_NOTIFY_WINDOW_MS = 5 * 60 * 1000;
