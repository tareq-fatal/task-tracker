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

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const dict: Dict = dictionaries[locale] ?? dictionaries.ar;
  const t = (key: TKey, vars?: Vars) => interpolate(dict[key] ?? key, vars);
  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
