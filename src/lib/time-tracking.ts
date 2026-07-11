// Pure time-tracking helpers. Unit-tested.

export function elapsedMinutes(startedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60000));
}

/** "1h 30m", "45m", "2h", "0m". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

export type TimeEntryLite = {
  minutes: number;
  startedAt: Date;
  endedAt: Date | null;
};

/** Total minutes across entries; running entries (endedAt null) count live elapsed. */
export function totalMinutes(entries: TimeEntryLite[], now: Date): number {
  return entries.reduce(
    (a, e) => a + (e.endedAt ? e.minutes : elapsedMinutes(e.startedAt, now)),
    0
  );
}

/**
 * Parse a manual duration: "90" (minutes), "1h30m", "1.5h", "2h", "45m".
 * Returns minutes, or null if unparseable.
 */
export function parseDurationToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10); // bare number = minutes
  const hm = s.match(/^(\d+(?:\.\d+)?)h(?:\s*(\d+)m?)?$/); // 1.5h | 1h30 | 1h30m | 2h
  if (hm) {
    const h = parseFloat(hm[1]);
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    return Math.round(h * 60 + m);
  }
  const mOnly = s.match(/^(\d+)m$/);
  if (mOnly) return parseInt(mOnly[1], 10);
  return null;
}
