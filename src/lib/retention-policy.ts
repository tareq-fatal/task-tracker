/**
 * Retention rules for the notification/activity cleanup (customer report
 * 2026-08). Pure functions — the DB-touching sweep lives in
 * notification-retention.ts, the admin actions in actions/retention.ts.
 */
export const DEFAULT_RETENTION_DAYS = 30;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;

const DAY_MS = 86_400_000;

/** Normalize a stored/user-supplied value to a safe day count. */
export function clampRetentionDays(value: unknown): number {
  // Number(null) === 0 — treat missing values as "use the default", not "1 day".
  if (value == null || value === "") return DEFAULT_RETENTION_DAYS;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  const days = Math.trunc(n);
  if (days < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS;
  if (days > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return days;
}

/** Everything strictly older than the returned instant gets deleted. */
export function retentionCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - clampRetentionDays(days) * DAY_MS);
}
