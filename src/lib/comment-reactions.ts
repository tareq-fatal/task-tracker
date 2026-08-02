import { isAdminRole } from "./enums";
import { can } from "./roles";

/** Reaction palette — order = picker order. Customer-final 2026-07-28:
 *  👍 👁 ☑️ 🌷 🫡 😶 — explicitly WITHOUT ❤️ (military context). */
export const REACTION_TYPES = [
  "thumbs_up",
  "seen",
  "check",
  "tulip",
  "salute",
  "no_mouth",
] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REACTION_EMOJI: Record<ReactionType, string> = {
  thumbs_up: "👍",
  seen: "👁",
  check: "☑️",
  tulip: "🌷",
  salute: "🫡",
  no_mouth: "😶",
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

/** May this actor delete content (comments, attachments, …)? Customer
 *  decision 2026-08-02 ("nur admin alles löschen"): Admin + BackendAdmin
 *  only — the former "own content" exception is gone, and SubAdmin stays
 *  excluded (user management only, no content moderation). Single source of
 *  truth is the `deleteContent` capability in roles.ts. */
export function canDeleteContent(actorRole: string): boolean {
  return can(actorRole, "deleteContent");
}

/** Who may REACT on comments. Customer decision 2026-07-28 ("Nein nur admin
 *  erstmal"): Admin + BackendAdmin only — everyone else SEES the chips but
 *  cannot react. Widen here when the customer opens it up. */
export function canReact(actorRole: string): boolean {
  return isAdminRole(actorRole);
}

/** Reaction notifications are deduped: repeated reactions on the same comment
 *  within this window produce no additional notification. */
export const REACTION_NOTIFY_WINDOW_MS = 5 * 60 * 1000;
