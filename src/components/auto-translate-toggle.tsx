"use client";

import { useState, useTransition } from "react";
import { setAutoTranslateAction } from "@/actions/translation-settings";
import { useT } from "@/components/i18n-provider";

/** Settings toggle for TR↔x display translation ("immer Original anzeigen"). */
export function AutoTranslateToggle({ initial }: { initial: boolean }) {
  const { t } = useT();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">{t("autoTrans.desc")}</p>
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            startTransition(async () => {
              const res = await setAutoTranslateAction(next);
              if (!res.ok) setOn(!next); // rollback on failure
            });
          }}
          className="h-4 w-4 accent-indigo-600"
        />
        <span>{t("autoTrans.toggle")}</span>
      </label>
    </div>
  );
}
