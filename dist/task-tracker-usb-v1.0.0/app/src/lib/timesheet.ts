// Pure weekly-timesheet + time-report helpers. Unit-tested.

import { elapsedMinutes } from "./time-tracking";

export type TimesheetEntry = {
  id: string;
  taskId: string;
  taskTitle: string;
  projectName: string | null;
  minutes: number;
  startedAt: Date;
  endedAt: Date | null; // null = running
  billable: boolean;
  note: string | null;
};

/** Monday 00:00 (local time) of the week containing d. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  out.setDate(out.getDate() - back);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** The 7 days (Mon–Sun) of the week starting at `start`. */
export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Local-date key, e.g. "2026-07-05". */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Parse a "YYYY-MM-DD" day key as LOCAL midnight (new Date("YYYY-MM-DD") would
 * be UTC midnight and shift the day in western timezones).
 */
export function parseDayKey(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, day);
  // the Date constructor rolls invalid parts over (month 13 → next year) — reject those
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return d;
}

/** Minutes of an entry; running entries count live elapsed. */
export function entryMinutes(e: Pick<TimesheetEntry, "minutes" | "startedAt" | "endedAt">, now: Date): number {
  return e.endedAt ? e.minutes : elapsedMinutes(e.startedAt, now);
}

export type WeekRow = {
  taskId: string;
  taskTitle: string;
  projectName: string | null;
  cells: number[]; // minutes per weekday, Mon..Sun
  total: number;
};

export type WeekGrid = {
  rows: WeekRow[];
  dayTotals: number[]; // Mon..Sun
  total: number;
  billable: number;
  nonBillable: number;
};

/** Aggregate a week's entries into a task × weekday grid (entry counts on its start day). */
export function buildWeekGrid(entries: TimesheetEntry[], start: Date, now: Date): WeekGrid {
  const keys = weekDays(start).map(dayKey);
  const byTask = new Map<string, WeekRow>();
  const dayTotals = new Array(7).fill(0);
  let billable = 0;
  let nonBillable = 0;

  for (const e of entries) {
    const col = keys.indexOf(dayKey(e.startedAt));
    if (col === -1) continue;
    const min = entryMinutes(e, now);
    let row = byTask.get(e.taskId);
    if (!row) {
      row = { taskId: e.taskId, taskTitle: e.taskTitle, projectName: e.projectName, cells: new Array(7).fill(0), total: 0 };
      byTask.set(e.taskId, row);
    }
    row.cells[col] += min;
    row.total += min;
    dayTotals[col] += min;
    if (e.billable) billable += min;
    else nonBillable += min;
  }

  const rows = [...byTask.values()].sort((a, b) => b.total - a.total);
  return { rows, dayTotals, total: billable + nonBillable, billable, nonBillable };
}

export type GroupTotal = {
  key: string;
  label: string;
  billable: number;
  nonBillable: number;
  total: number;
};

/** Group entries (e.g. by user/project/sprint) into billable/non-billable totals, largest first. */
export function groupTotals<T extends Pick<TimesheetEntry, "minutes" | "startedAt" | "endedAt" | "billable">>(
  entries: T[],
  now: Date,
  keyOf: (e: T) => string,
  labelOf: (e: T) => string
): GroupTotal[] {
  const map = new Map<string, GroupTotal>();
  for (const e of entries) {
    const key = keyOf(e);
    let g = map.get(key);
    if (!g) {
      g = { key, label: labelOf(e), billable: 0, nonBillable: 0, total: 0 };
      map.set(key, g);
    }
    const min = entryMinutes(e, now);
    if (e.billable) g.billable += min;
    else g.nonBillable += min;
    g.total += min;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** "7:30" — decimal-free hours:minutes for invoice-style totals. */
export function formatHoursMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
