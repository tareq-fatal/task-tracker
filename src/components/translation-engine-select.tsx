"use client";

import { useState, useTransition } from "react";
import { setTranslationEngineAction } from "@/actions/translation-engine";
import { useT } from "@/components/i18n-provider";

/** Admin setting: translation provider (auto / DeepL / LibreTranslate).
 *  `deeplConfigured` only affects the hint text — the "auto" chain degrades
 *  gracefully either way. */
export function TranslationEngineSelect({
  initial,
  deeplConfigured,
}: {
  initial: string;
  deeplConfigured: boolean;
}) {
  const { t } = useT();
  const [engine, setEngine] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">{t("transEngine.desc")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("transEngine.title")}
          value={engine}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setEngine(next);
            setSaved(false);
            startTransition(async () => {
              const res = await setTranslationEngineAction(next);
              if (res.ok) setSaved(true);
              else setEngine(initial);
            });
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="auto">{t("transEngine.auto")}</option>
          <option value="deepl">DeepL</option>
          <option value="libre">LibreTranslate</option>
        </select>
        {saved && <span className="text-xs text-emerald-600">{t("retention.saved")}</span>}
      </div>
      {!deeplConfigured && (
        <p className="mt-2 text-xs text-amber-600">{t("transEngine.noDeepl")}</p>
      )}
    </div>
  );
}
