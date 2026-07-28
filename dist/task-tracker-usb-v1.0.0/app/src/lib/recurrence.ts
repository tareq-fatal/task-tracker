// Minimal iCal-RRULE subset for recurring tasks. Pure + unit-tested.
// Supported: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL=n, BYDAY=MO,TU,WE,TH,FR,SA,SU.

export type RecurrencePreset = "none" | "daily" | "weekly" | "monthly";

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function presetToRule(preset: RecurrencePreset): string | null {
  switch (preset) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    default:
      return null;
  }
}

// Weekday codes in the order iCal expects them; index === JS Date.getUTCDay().
export const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Build an RRULE from the UI's building blocks. `interval` clamps to ≥1;
 * `byday` (weekly only) is normalised to the canonical SU…SA order and
 * de-duplicated. Returns null for the "none" preset.
 */
export function buildRule(
  preset: RecurrencePreset,
  interval = 1,
  byday: string[] = []
): string | null {
  const base = presetToRule(preset);
  if (!base) return null;
  const parts = [base];
  const iv = Math.max(1, Math.floor(interval) || 1);
  if (iv > 1) parts.push(`INTERVAL=${iv}`);
  if (preset === "weekly" && byday.length) {
    const valid = WEEKDAYS.filter((d) => byday.includes(d));
    if (valid.length) parts.push(`BYDAY=${valid.join(",")}`);
  }
  return parts.join(";");
}

/** The BYDAY weekday codes of a rule, in canonical order (empty when none). */
export function ruleWeekdays(rule: string | null | undefined): Weekday[] {
  if (!rule) return [];
  const idx = parseRule(rule).byday;
  return WEEKDAYS.filter((_, i) => idx.includes(i));
}

/** The INTERVAL of a rule (≥1). */
export function ruleInterval(rule: string | null | undefined): number {
  if (!rule) return 1;
  return parseRule(rule).interval;
}

type Parsed = { freq?: string; interval: number; byday: number[] };

export function parseRule(rule: string): Parsed {
  const out: Parsed = { interval: 1, byday: [] };
  for (const part of rule.split(";")) {
    const [kRaw, vRaw] = part.split("=");
    const k = kRaw?.trim().toUpperCase();
    const v = vRaw?.trim().toUpperCase();
    if (!k || !v) continue;
    if (k === "FREQ") out.freq = v;
    else if (k === "INTERVAL") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.interval = n;
    } else if (k === "BYDAY") {
      out.byday = v
        .split(",")
        .map((d) => DAY_CODES.indexOf(d.trim() as (typeof DAY_CODES)[number]))
        .filter((i) => i >= 0);
    }
  }
  return out;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  // clamp to the last day of the resulting month
  const lastDay = new Date(
    Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)
  ).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

/**
 * The next occurrence strictly after `from`, or null for an invalid/empty rule.
 * Time-of-day is preserved from `from`.
 */
export function nextOccurrence(rule: string | null | undefined, from: Date): Date | null {
  if (!rule) return null;
  const p = parseRule(rule);
  if (!p.freq) return null;

  if (p.freq === "DAILY") return addDays(from, p.interval);

  if (p.freq === "WEEKLY") {
    if (p.byday.length === 0) return addDays(from, 7 * p.interval);
    // find the next listed weekday after `from` (within the next interval weeks)
    const set = new Set(p.byday);
    for (let i = 1; i <= 7 * Math.max(1, p.interval); i++) {
      const cand = addDays(from, i);
      if (set.has(cand.getUTCDay())) return cand;
    }
    return addDays(from, 7 * p.interval);
  }

  if (p.freq === "MONTHLY") return addMonths(from, p.interval);

  return null;
}

export function describeRule(rule: string | null | undefined): RecurrencePreset {
  if (!rule) return "none";
  const f = parseRule(rule).freq;
  if (f === "DAILY") return "daily";
  if (f === "WEEKLY") return "weekly";
  if (f === "MONTHLY") return "monthly";
  return "none";
}
