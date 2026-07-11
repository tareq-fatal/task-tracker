// Global search (Ctrl+K / Cmd+K) — pure helpers shared by the server action
// and the command palette. Query parsing and Prisma where-builders live here
// (no DB access) so tenant scoping stays unit-testable.

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
export const SEARCH_MAX_TOKENS = 5;

export type SearchItemType = "task" | "project" | "user" | "comment";

export type SearchItem = {
  type: SearchItemType;
  id: string;
  /** Primary display text (task title, project/user name, comment's task title). */
  title: string;
  /** Secondary line (project name, @username, comment snippet, …). */
  subtitle?: string;
  href: string;
  /** Raw enum badge (task status / priority) — translated client-side. */
  status?: string;
  taskType?: string;
  /**
   * Extra text the item matched on but which isn't shown as the title
   * (description/comment-body snippet, email). The client-side fuzzy ranker
   * searches this too, so an item found only via its description survives.
   */
  haystack?: string;
  /**
   * True for recency-pool candidates (returned only so the client-side fuzzy
   * ranker can catch typos). Pool items that the ranker doesn't match are
   * never shown; strict DB hits (pool: undefined) always survive.
   */
  pool?: boolean;
};

export function normalizeQuery(raw: string): string {
  return raw.trim().slice(0, SEARCH_MAX_CHARS);
}

/** Whitespace-split tokens, capped so a pasted paragraph can't explode the query. */
export function tokenize(query: string): string[] {
  return normalizeQuery(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SEARCH_MAX_TOKENS);
}

/**
 * Prisma sub-clause: EVERY token must appear (case-insensitive substring) in at
 * least one of `fields`. Spread-merged with the tenant/visibility clause by the
 * caller — never used on its own.
 */
export function tokensWhere(tokens: string[], fields: string[]) {
  return {
    AND: tokens.map((token) => ({
      OR: fields.map((field) => ({
        [field]: { contains: token, mode: "insensitive" as const },
      })),
    })),
  };
}

/** De-duplicate by type+id, keeping the first occurrence (strict hits win over pool). */
export function dedupeItems(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const out: SearchItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Short excerpt of `text` centred on the first case-insensitive hit of any
 * token, so the match is visible in the result row. Falls back to the head of
 * the text when nothing matches (fuzzy pool items).
 */
export function snippet(
  text: string,
  tokens: string[],
  maxLen = 90
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;

  const lower = clean.toLowerCase();
  let hit = -1;
  for (const token of tokens) {
    const i = lower.indexOf(token.toLowerCase());
    if (i !== -1 && (hit === -1 || i < hit)) hit = i;
  }
  if (hit <= maxLen / 2) {
    return clean.slice(0, maxLen).trimEnd() + "…";
  }
  const start = Math.max(0, hit - Math.floor(maxLen / 2));
  const end = Math.min(clean.length, start + maxLen);
  return (
    "…" + clean.slice(start, end).trim() + (end < clean.length ? "…" : "")
  );
}
