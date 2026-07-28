// Minimal, dependency-free 5-field cron parser + timezone-aware "next run"
// computation. Pure and unit-tested.
//
// Fields (standard crontab order):
//   ┌ minute        0-59
//   │ ┌ hour        0-23
//   │ │ ┌ day-of-month  1-31
//   │ │ │ ┌ month     1-12
//   │ │ │ │ ┌ day-of-week 0-6  (0 = Sunday; 7 also accepted as Sunday)
//   * * * * *
//
// Per field we accept: "*", a number, a list "a,b,c", a range "a-b", and a
// step "*/n" or "a-b/n". Names (JAN, MON, …) are NOT supported — keep the
// surface small and predictable.
//
// Day-of-month and day-of-week: when BOTH are restricted (not "*"), a minute
// matches if EITHER matches — this mirrors Vixie cron, the behaviour every
// operator expects from "0 9 1 * MON".

export type CronField = { min: number; max: number };

const FIELDS: CronField[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 6 }, // day of week (0 = Sun)
];

export type ParsedCron = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
};

function parseField(spec: string, field: CronField): Set<number> {
  const out = new Set<number>();
  for (const partRaw of spec.split(",")) {
    const part = partRaw.trim();
    if (!part) throw new Error(`empty cron term in "${spec}"`);

    // step: "<range>/<n>"
    let step = 1;
    let rangeSpec = part;
    const slash = part.indexOf("/");
    if (slash >= 0) {
      rangeSpec = part.slice(0, slash);
      step = parseInt(part.slice(slash + 1), 10);
      if (!Number.isFinite(step) || step <= 0) throw new Error(`bad step in "${part}"`);
    }

    let lo: number;
    let hi: number;
    if (rangeSpec === "*") {
      lo = field.min;
      hi = field.max;
    } else if (rangeSpec.includes("-")) {
      const [a, b] = rangeSpec.split("-");
      lo = parseInt(a, 10);
      hi = parseInt(b, 10);
    } else {
      lo = parseInt(rangeSpec, 10);
      hi = lo;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`bad number in "${part}"`);

    // day-of-week: normalise 7 → 0 (Sunday)
    if (field.max === 6) {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }
    if (lo > hi) throw new Error(`reversed range in "${part}"`);
    if (lo < field.min || hi > field.max) throw new Error(`out of range in "${part}"`);

    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  if (out.size === 0) throw new Error(`no values in "${spec}"`);
  return out;
}

/** Parse a 5-field cron expression. Throws on malformed input. */
export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron must have 5 fields, got ${parts.length}: "${expr}"`);
  }
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = parts.map((p, i) =>
    parseField(p, FIELDS[i])
  );
  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: parts[2].trim() !== "*",
    dowRestricted: parts[4].trim() !== "*",
  };
}

/** True when `expr` is a valid 5-field cron expression. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock components of a UTC instant, as seen in `tz`. */
type Wall = { year: number; month: number; day: number; hour: number; minute: number; dow: number };

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function wallClock(instant: Date, tz: string): Wall {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    dow: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

function matches(w: Wall, c: ParsedCron): boolean {
  if (!c.minutes.has(w.minute)) return false;
  if (!c.hours.has(w.hour)) return false;
  if (!c.months.has(w.month)) return false;
  // Vixie DOM/DOW semantics: if both restricted → OR; else → AND.
  const domOk = c.daysOfMonth.has(w.day);
  const dowOk = c.daysOfWeek.has(w.dow);
  if (c.domRestricted && c.dowRestricted) {
    if (!(domOk || dowOk)) return false;
  } else {
    if (!domOk || !dowOk) return false;
  }
  return true;
}

// One year of minutes is the hard cap: a valid cron always fires within a year,
// and an impossible one (e.g. "0 0 30 2 *") stops the scan instead of looping.
const MAX_MINUTES = 366 * 24 * 60;

/**
 * The first instant strictly after `from` that satisfies `expr`, evaluated in
 * `tz` (IANA zone, default "UTC"). Returns null for an invalid expression or if
 * nothing matches within a year (an unsatisfiable schedule).
 *
 * DST-correct: candidates are real UTC instants and the match test reads their
 * wall-clock in `tz`, so "0 9 * * *" stays 09:00 local across a spring-forward.
 */
export function nextCronOccurrence(
  expr: string,
  from: Date,
  tz: string = "UTC"
): Date | null {
  let cron: ParsedCron;
  try {
    cron = parseCron(expr);
  } catch {
    return null;
  }
  // Round up to the next whole minute boundary strictly after `from`.
  const start = new Date(from);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  const cand = new Date(start);
  for (let i = 0; i < MAX_MINUTES; i++) {
    let w: Wall;
    try {
      w = wallClock(cand, tz);
    } catch {
      return null; // invalid timezone
    }
    if (matches(w, cron)) return new Date(cand);
    cand.setUTCMinutes(cand.getUTCMinutes() + 1);
  }
  return null;
}
