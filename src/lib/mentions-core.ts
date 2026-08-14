// Pure @-mention helpers — no I/O, no React, fully unit-tested.

/**
 * The @token being typed right before the caret, or null when the caret isn't
 * in one. Deliberately mirrors `parseMentions` in notifications-core: a mention
 * starts at the beginning of the text or after a character that can't be part
 * of a username, so an email address ("a@b.de") never opens the picker.
 *
 * @returns `query` (lower-cased, may be empty right after "@") and `start`,
 *          the index of the "@" itself.
 */
export function activeMentionQuery(
  text: string,
  caret: number
): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|[^a-zA-Z0-9_.-])@([a-zA-Z0-9_.-]{0,30})$/.exec(before);
  if (!m) return null;
  return { query: m[2].toLowerCase(), start: caret - m[2].length - 1 };
}

/** Replace the active @token with `@username `, returning the new text and
 *  where the caret belongs afterwards. */
export function applyMention(
  text: string,
  token: { query: string; start: number },
  username: string
): { text: string; caret: number } {
  const end = token.start + 1 + token.query.length;
  const inserted = `@${username} `;
  return {
    text: text.slice(0, token.start) + inserted + text.slice(end),
    caret: token.start + inserted.length,
  };
}
