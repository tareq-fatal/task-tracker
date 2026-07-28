"use client";

import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

/**
 * First-use coach-mark. Shows a small dismissible tooltip the FIRST time a
 * feature (Kanban / Sprint / Timer) appears for this user on this device, then
 * never again. Persisted per-device in localStorage — deliberately not on the
 * server, since it's a per-browser "have you seen this UI yet" nudge, not
 * account state. Place inside a `relative` container of the feature.
 */

const HINT_IDS = ["kanban", "sprint", "timer"] as const;
export type HintId = (typeof HINT_IDS)[number];

const storageKey = (id: string) => `tt_hint_${id}`;

/** Reset all feature hints so they show again (called from "restart onboarding"). */
export function resetFeatureHints(): void {
  if (typeof window === "undefined") return;
  for (const id of HINT_IDS) localStorage.removeItem(storageKey(id));
}

type Placement = "top" | "bottom";

const PLACEMENT: Record<Placement, string> = {
  // Logical props (start/end) keep the bubble correct in RTL (Arabic).
  top: "bottom-full mb-3 start-0",
  bottom: "top-full mt-3 start-0",
};

export function FeatureHint({
  id,
  titleKey,
  textKey,
  placement = "bottom",
  className,
}: {
  id: HintId;
  titleKey: TKey;
  textKey: TKey;
  placement?: Placement;
  className?: string;
}) {
  const { t } = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(storageKey(id))) return;
    // small delay so the feature has painted before the bubble points at it
    const timer = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(timer);
  }, [id]);

  function dismiss() {
    setShow(false);
    if (typeof window !== "undefined") localStorage.setItem(storageKey(id), "1");
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label={t(titleKey)}
      className={cn(
        "absolute z-40 w-72 max-w-[80vw] animate-in fade-in zoom-in-95 duration-200",
        PLACEMENT[placement],
        className
      )}
    >
      <div className="rounded-2xl border border-indigo-200/70 bg-white p-4 shadow-xl shadow-indigo-900/10 ring-1 ring-black/5 dark:border-indigo-400/20 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" />
            {t(titleKey)}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("common.done")}
            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {t(textKey)}
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg bg-gradient-to-r from-indigo-500 to-pink-500 px-3 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-px"
          >
            {t("onboarding.hint.gotIt")}
          </button>
        </div>
      </div>
    </div>
  );
}
