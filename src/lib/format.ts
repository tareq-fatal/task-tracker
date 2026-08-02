import type { Locale } from "./enums";

// Map our app locale to a BCP-47 tag with the right regional conventions:
// DE → 28.06.2026 / 1.234,56 · EN → 6/28/2026 / 1,234.56 · AR → Arabic digits
const TAG: Record<Locale, string> = { ar: "ar-EG", de: "de-DE", en: "en-US", tr: "tr-TR" };

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

/** Relative time, locale-aware ("vor 2 Stunden" / "منذ ساعتين"). Falls back
 *  to the absolute date beyond ~30 days — "vor 8 Monaten" hilft niemandem
 *  bei einem Anhang. Pair with a title-tooltip carrying formatDateTime. */
export function formatRelative(d: Date | string | number, locale: Locale, now: Date = new Date()): string {
  const diffMs = asDate(d).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  const rtf = new Intl.RelativeTimeFormat(TAG[locale], { numeric: "auto" });
  if (abs < MIN) return rtf.format(Math.round(diffMs / 1000), "second");
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), "day");
  return formatDate(d, locale);
}

/** Thousands-grouped number, locale-aware. DE → "1.234,56". */
export function formatNumber(n: number, locale: Locale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits }).format(n);
}
