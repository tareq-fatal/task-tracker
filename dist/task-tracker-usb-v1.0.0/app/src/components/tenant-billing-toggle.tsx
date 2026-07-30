"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/i18n-provider";
import { setTenantBillingAction } from "@/actions/tenants";

/** BackendAdmin-only checkbox on the tenant list: billable/non-billable UI
 *  on or off for this tenant (military tenants track time without invoicing). */
export function TenantBillingToggle({
  tenantId,
  enabled: initial,
}: {
  tenantId: string;
  enabled: boolean;
}) {
  const { t } = useT();
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t("tenants.billingHint")}>
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setEnabled(next);
          start(async () => {
            const res = await setTenantBillingAction(tenantId, next);
            if (!res.ok) setEnabled(!next);
          });
        }}
        className="h-4 w-4 accent-indigo-600"
      />
      {t("tenants.billing")}
    </label>
  );
}
