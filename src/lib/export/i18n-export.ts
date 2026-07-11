import { getDictionary, type TKey } from "@/lib/i18n";
import type { Locale } from "@/lib/enums";

type Vars = Record<string, string | number>;

/**
 * Server-side translator mirroring the client `useT()` hook: looks a key up in
 * the locale dictionary and interpolates {name} placeholders. Falls back to the
 * key itself when missing, so a forgotten string is visible rather than blank.
 */
export function makeExportT(locale: Locale): (key: TKey, vars?: Vars) => string {
  const dict = getDictionary(locale);
  return (key, vars) => {
    const raw = dict[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  };
}

export type ExportT = ReturnType<typeof makeExportT>;
