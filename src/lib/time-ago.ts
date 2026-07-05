// Pure, locale-agnostic relative-time bucketing for the notification list.
// Returns a unit + value so the UI layer can render it through i18n (keeping the
// three languages consistent) instead of hard-coding English strings here.

export type TimeAgo =
  | { unit: "now" }
  | { unit: "m" | "h" | "d"; value: number }
  | { unit: "date"; value: number }; // ms timestamp — render as a locale date

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Bucket the age of `then` relative to `now` (both ms). */
export function timeAgo(then: number, now: number): TimeAgo {
  const diff = Math.max(0, now - then);
  if (diff < MIN) return { unit: "now" };
  if (diff < HOUR) return { unit: "m", value: Math.floor(diff / MIN) };
  if (diff < DAY) return { unit: "h", value: Math.floor(diff / HOUR) };
  if (diff < 7 * DAY) return { unit: "d", value: Math.floor(diff / DAY) };
  return { unit: "date", value: then };
}
