"use client";

import { useT } from "@/components/i18n-provider";
import { useTooltipsEnabled, setTooltipsEnabled } from "@/components/ui/tooltip";

/**
 * Per-user "show help tooltips" switch. The preference lives in localStorage
 * (default ON) so it needs no DB column — see the branch report for the
 * rationale (shared dev database, migration churn).
 */
export function TooltipToggle() {
  const { t } = useT();
  const enabled = useTooltipsEnabled();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor="tt-tooltips" className="text-sm font-medium">
          {t("settings.tooltipsOn")}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.tooltipsHint")}</p>
      </div>
      <button
        id="tt-tooltips"
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setTooltipsEnabled(!enabled)}
        className={
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
          (enabled ? "bg-indigo-600" : "bg-input")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
            (enabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5")
          }
        />
      </button>
    </div>
  );
}
