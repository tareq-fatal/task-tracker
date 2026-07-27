"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/i18n-provider";
import { setNotifyAllEventsAction } from "@/actions/telegram";

/** Admin-only: "receive ALL tenant events on my Telegram" personal broadcast. */
export function NotifyAllToggle({ initial }: { initial: boolean }) {
  const { t } = useT();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <label className="mt-3 flex items-start gap-2 text-sm" title={t("settings.allEventsHint")}>
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const res = await setNotifyAllEventsAction(next).catch(() => ({ ok: false }));
            if (!res.ok) setOn(!next);
          });
        }}
        className="mt-0.5 h-4 w-4 accent-indigo-600"
      />
      <span>
        {t("settings.allEvents")}
        <span className="block text-xs text-muted-foreground">{t("settings.allEventsHint")}</span>
      </span>
    </label>
  );
}
