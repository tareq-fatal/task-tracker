"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { setRevealHiddenAction } from "@/actions/hidden-projects";

/** TOF-0966 — Einstellungen (Admin): „Verborgene anzeigen“ für diese Sitzung. */
export function RevealHiddenToggle({ initial }: { initial: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        data-testid="reveal-hidden-toggle"
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const res = await setRevealHiddenAction(next).catch(() => ({ ok: false as const }));
            if (!res.ok) setOn(!next);
            router.refresh();
          });
        }}
        className="mt-0.5 h-4 w-4 accent-indigo-600"
      />
      <span>
        {t("settings.hiddenProjects.reveal")}
        <span className="block text-xs text-muted-foreground">{t("settings.hiddenProjects.hint")}</span>
      </span>
    </label>
  );
}

/** Schmale Leiste über jeder Seite, solange der Modus aktiv ist. */
export function RevealBanner() {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="status"
      data-testid="reveal-banner"
      className="flex items-center justify-center gap-3 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
    >
      <EyeOff className="h-3.5 w-3.5" />
      <span>{t("reveal.banner")}</span>
      <button
        type="button"
        disabled={pending}
        className="rounded border border-amber-400 px-2 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-800"
        onClick={() =>
          start(async () => {
            await setRevealHiddenAction(false).catch(() => {});
            router.refresh();
          })
        }
      >
        {t("reveal.off")}
      </button>
    </div>
  );
}
