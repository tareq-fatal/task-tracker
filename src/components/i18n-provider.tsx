"use client";

import { createContext, useContext } from "react";
import {
  dictionaries,
  interpolate,
  translatePlural,
  type Dict,
  type PluralKey,
  type TKey,
  type Vars,
} from "@/lib/i18n";
import type { Locale } from "@/lib/enums";

type I18nContextValue = {
  locale: Locale;
  t: (key: TKey, vars?: Vars) => string;
  /** Count-aware translation (Intl.PluralRules; Arabic dual/paucal included). */
  tp: (key: PluralKey, n: number, vars?: Vars) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "ar",
  t: (k) => k,
  tp: (k, n) => `${k}:${n}`,
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
  const tp = (key: PluralKey, n: number, vars?: Vars) =>
    translatePlural(locale, key, n, vars);
  return (
    <I18nContext.Provider value={{ locale, t, tp }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
