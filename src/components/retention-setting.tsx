"use client";

import { useState, useTransition } from "react";
import { setNotificationRetentionAction } from "@/actions/retention";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "@/lib/retention-policy";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

/** Admin setting on /settings: "delete notifications older than N days". */
export function RetentionSetting({ initialDays }: { initialDays: number }) {
  const { t } = useT();
  const [days, setDays] = useState(String(initialDays));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const n = parseInt(days, 10);
  const valid = Number.isInteger(n) && n >= MIN_RETENTION_DAYS && n <= MAX_RETENTION_DAYS;

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">{t("retention.settingDesc")}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("retention.labelBefore")}</span>
        <input
          type="number"
          min={MIN_RETENTION_DAYS}
          max={MAX_RETENTION_DAYS}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setSaved(false);
          }}
          className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
        />
        <span>{t("retention.labelAfter")}</span>
        <Button
          type="button"
          variant="solid"
          size="sm"
          disabled={pending || !valid}
          onClick={() =>
            startTransition(async () => {
              const res = await setNotificationRetentionAction(n);
              if (res.ok) setSaved(true);
            })
          }
        >
          {t("retention.save")}
        </Button>
        {saved && <span className="text-xs text-emerald-600">{t("retention.saved")}</span>}
      </div>
    </div>
  );
}
