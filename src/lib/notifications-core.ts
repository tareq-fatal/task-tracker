// Pure notification routing logic — no I/O, fully unit-tested.

export const NOTIFICATION_EVENTS = [
  "assigned",
  "status",
  "comment",
  "mention",
  "due_soon",
  "overdue",
  "blocker_resolved",
  "recurring",
  "task_seen", // WhatsApp-style: assignee opened the task for the first time
  "admin_activity", // #35 — admins are told about every user change to a task
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ["inApp", "webPush", "email", "native"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type ChannelPrefs = Record<NotificationChannel, boolean>;

export function isNotificationEvent(v: string): v is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(v);
}

/** Sensible defaults when a user has no explicit preference row. */
export function defaultPrefs(event: NotificationEvent): ChannelPrefs {
  // In-app always on by default; web/native push on; email off (opt-in).
  // Noisy bulk events (due_soon/overdue) default email-on since they're digest-y.
  const emailDefault = event === "due_soon" || event === "overdue";
  return { inApp: true, webPush: true, email: emailDefault, native: true };
}

/**
 * Is `hour` (0-23) within the quiet-hours window? Handles windows that wrap past
 * midnight (e.g. 22→7). Returns false when quiet hours are unset.
 */
export function isQuietHours(
  hour: number,
  start: number | null | undefined,
  end: number | null | undefined
): boolean {
  if (start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end; // same-day window
  return hour >= start || hour < end; // wraps midnight
}

/**
 * Which channels to deliver on RIGHT NOW. In-app always respects the pref.
 * During quiet hours, only in-app is delivered instantly; push/email/native are
 * suppressed (they get picked up by the digest / next active window).
 */
export function resolveChannels(
  prefs: ChannelPrefs,
  opts: { hour: number; quietStart?: number | null; quietEnd?: number | null }
): ChannelPrefs {
  const quiet = isQuietHours(opts.hour, opts.quietStart, opts.quietEnd);
  return {
    inApp: prefs.inApp,
    webPush: prefs.webPush && !quiet,
    email: prefs.email && !quiet,
    native: prefs.native && !quiet,
  };
}

export function anyChannelEnabled(c: ChannelPrefs): boolean {
  return c.inApp || c.webPush || c.email || c.native;
}

/** Extract @mention usernames from free text (letters, digits, ._-). */
export function parseMentions(text: string): string[] {
  const out = new Set<string>();
  const re = /(^|[^a-zA-Z0-9_.-])@([a-zA-Z0-9_.-]{2,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[2].toLowerCase());
  return [...out];
}
