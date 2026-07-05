// Shared, framework-free constants for the recurring-tasks feature. Kept out of
// the server-only modules so both client components and server actions can use
// them without pulling in "server-only".

// Default IANA zone a new series' cron/preset is anchored to. The product is
// German-ops-facing (coastshield.net), so Central European time is the sane
// default; users can pick any zone per series.
export const DEFAULT_RECUR_TZ = "Europe/Berlin";

// A short, curated list of zones offered in the UI's timezone picker. Not
// exhaustive — the field accepts any valid IANA name.
export const COMMON_TIMEZONES = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Damascus",
  "America/New_York",
  "America/Los_Angeles",
] as const;

export type RecurEndType = "never" | "count" | "until";
