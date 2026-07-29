import type { Locale } from "@/lib/enums";

const INTL_LOCALE: Record<Locale, string> = { ar: "ar", en: "en-GB", de: "de-DE", tr: "tr-TR" };

/** Locale-aware short date (falls back to ISO on any Intl hiccup). */
export function fmtDate(locale: Locale, d: Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Locale-aware date + time. */
export function fmtDateTime(locale: Locale, d: Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "en-GB", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

/** Slugify a tenant slug + date into a safe file basename. */
export function exportBaseName(prefix: string, tenantSlug: string, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const safeSlug = tenantSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "tenant";
  return `${prefix}-${safeSlug}-${date}`;
}
