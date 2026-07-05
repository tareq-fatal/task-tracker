import type { Locale } from "./enums";

// Map our app locale to a BCP-47 tag with the right regional conventions:
// DE → 28.06.2026 / 1.234,56 · EN → 6/28/2026 / 1,234.56 · AR → Arabic digits
const TAG: Record<Locale, string> = { ar: "ar-EG", de: "de-DE", en: "en-US" };

function asDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

/** Short date, locale-aware. DE → "28.06.2026". */
export function formatDate(d: Date | string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(TAG[locale], { day: "2-digit", month: "2-digit", year: "numeric" }).format(asDate(d));
}

/** Date + time, locale-aware. DE → "28.06.2026, 14:30". */
export function formatDateTime(d: Date | string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(TAG[locale], {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(asDate(d));
}

/** Thousands-grouped number, locale-aware. DE → "1.234,56". */
export function formatNumber(n: number, locale: Locale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits }).format(n);
}

/** Time of day only, locale-aware. DE → "14:30", EN → "2:30 PM". */
export function formatTime(d: Date | string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(TAG[locale], { hour: "2-digit", minute: "2-digit" }).format(asDate(d));
}

/** Compact day + month (calendar/list badges). DE → "28.06.". */
export function formatDayMonth(d: Date | string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(TAG[locale], { day: "2-digit", month: "2-digit" }).format(asDate(d));
}

/** Month heading, locale-aware. DE → "Juni 2026". */
export function formatMonthYear(d: Date | string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(TAG[locale], { month: "long", year: "numeric" }).format(asDate(d));
}

/** Percentage, locale-aware (AR gets Arabic digits + ٪). */
export function formatPercent(fraction: number, locale: Locale, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(TAG[locale], { style: "percent", maximumFractionDigits }).format(fraction);
}
