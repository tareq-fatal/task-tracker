// #12 — per-comment read-receipt logic (Telegram-style ✓/✓✓).
//
// A comment's "expected readers" are the people it was clearly meant for:
//   • everyone @mentioned in that comment, plus
//   • the task's assignees,
// minus the comment's own author (you don't need to read your own message).
//
// Receipt states, from the author's point of view:
//   • "sent" — nobody who was meant to see it has read it yet        → single ✓ (muted)
//   • "some" — at least one, but not all, expected readers have read → single ✓ (accent)
//   • "all"  — every expected reader has read it                     → double ✓✓ (accent)
//
// Kept pure (no Prisma, no I/O) so it's trivially unit-testable.

export type ReceiptState = "sent" | "some" | "all";

/**
 * @param expectedReaderIds userIds the comment was meant for (mentions +
 *   assignees, already excluding the author). Duplicates are tolerated.
 * @param readerIds userIds that have a read-receipt row for the comment.
 */
export function receiptState(
  expectedReaderIds: string[],
  readerIds: Iterable<string>
): ReceiptState {
  const readSet = readerIds instanceof Set ? readerIds : new Set(readerIds);
  const expected = [...new Set(expectedReaderIds)];

  // No specific audience (no mentions, no other assignees): fall back to
  // "anyone at all read it" so a lone author still gets a ✓✓ once someone sees it.
  if (expected.length === 0) {
    return readSet.size > 0 ? "all" : "sent";
  }

  const readCount = expected.reduce((n, id) => n + (readSet.has(id) ? 1 : 0), 0);
  if (readCount === 0) return "sent";
  return readCount === expected.length ? "all" : "some";
}

/**
 * The people a comment is "for": its @mentions unioned with the task's
 * assignees, minus the author. Pure set algebra over ids.
 */
export function expectedReaders(
  authorId: string,
  mentionedIds: Iterable<string>,
  assigneeIds: Iterable<string>
): string[] {
  const out = new Set<string>();
  for (const id of mentionedIds) out.add(id);
  for (const id of assigneeIds) out.add(id);
  out.delete(authorId);
  return [...out];
}
