"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";
import { setTenantFeatureAction } from "@/actions/tenants";
import type { TenantFeature } from "@/lib/tenant-features";

/** BackendAdmin-only feature switches on the tenant list ("Features" section):
 *  billing, parent tasks, story points. Data is kept when a feature goes off —
 *  only the UI hides; effective on next render, no restart. */
export function TenantFeatureToggles({
  tenantId,
  flags,
  translationConfigured = true,
}: {
  tenantId: string;
  flags: Record<TenantFeature, boolean>;
  /** Whether DEEPL_API_KEY is set on the server — without it the translation
   *  toggle is moot, so it shows a hint instead of pretending to work. */
  translationConfigured?: boolean;
}) {
  const { t } = useT();
  const [state, setState] = useState(flags);
  const [pending, start] = useTransition();

  const ROWS: { key: TenantFeature; label: TKey; hint: TKey }[] = [
    { key: "billingEnabled", label: "tenants.billing", hint: "tenants.billingHint" },
    { key: "parentTasksEnabled", label: "tenants.parentTasks", hint: "tenants.parentTasksHint" },
    { key: "storyPointsEnabled", label: "tenants.storyPoints", hint: "tenants.storyPointsHint" },
    { key: "translationEnabled", label: "tenants.translation", hint: "tenants.translationHint" },
  ];

  return (
    <div className="flex flex-col gap-1">
      {ROWS.map((r) => (
        <label
          key={r.key}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={t(r.hint)}
        >
          <input
            type="checkbox"
            checked={state[r.key]}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setState((s) => ({ ...s, [r.key]: next }));
              start(async () => {
                const res = await setTenantFeatureAction(tenantId, r.key, next);
                if (!res.ok) setState((s) => ({ ...s, [r.key]: !next }));
              });
            }}
            className="h-4 w-4 accent-indigo-600"
          />
          {t(r.label)}
        </label>
      ))}
      {!translationConfigured && (
        <p className="max-w-[16rem] text-[11px] leading-snug text-amber-600">
          {t("tenants.translationNoKey")}
        </p>
      )}
    </div>
  );
}
