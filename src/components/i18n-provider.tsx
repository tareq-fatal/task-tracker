"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dict, type TKey } from "@/lib/i18n";
import type { Locale } from "@/lib/enums";

type I18nContextValue = {
  locale: Locale;
  t: (key: TKey) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "de",
  t: (k) => k,
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const dict: Dict = dictionaries[locale] ?? dictionaries.de;
  const t = (key: TKey) => dict[key] ?? key;
  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
