"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dict, type TKey } from "@/lib/i18n";
import type { Locale } from "@/lib/enums";

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  t: (key: TKey, vars?: Vars) => string;
};

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}

const I18nContext = createContext<I18nContextValue>({
  locale: "ar",
  t: (k) => k,
});

/**
 * TOF-0795 (Tarek 31.10.2026): `appName` = Instanz-Name vom Server (APP_NAME zur
 * Laufzeit, sonst NEXT_PUBLIC_APP_NAME). Überschreibt „app.name“ im Client-
 * Wörterbuch; ohne Prop (oder leer) bleibt alles wie bisher.
 */
export function I18nProvider({
  locale,
  appName,
  children,
}: {
  locale: Locale;
  appName?: string | null;
  children: React.ReactNode;
}) {
  const dict: Dict = dictionaries[locale] ?? dictionaries.ar;
  const t = (key: TKey, vars?: Vars) =>
    interpolate(key === "app.name" && appName ? appName : dict[key] ?? key, vars);
  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
