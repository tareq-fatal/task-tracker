"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { purgeActivityAction, purgeNotificationsAction } from "@/actions/retention";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

/** Admin cleanup pair: "delete older than N days" + the red emergency
 *  "delete all". Used on /admin/notifications and /admin/activity. */
export function RetentionPurgeButtons({
  kind,
  days,
}: {
  kind: "notifications" | "activity";
  days: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState<number | null>(null);
  const action = kind === "activity" ? purgeActivityAction : purgeNotificationsAction;

  const run = (mode: "old" | "all") => {
    const msg = mode === "all" ? t("retention.confirmAll") : t("retention.confirmOld", { days });
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await action(mode);
      if (res.ok) {
        setDeleted(res.deleted ?? 0);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run("old")}>
        <Trash2 className="me-1 h-4 w-4" />
        {t("retention.purgeOld", { days })}
      </Button>
      <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => run("all")}>
        <AlertTriangle className="me-1 h-4 w-4" />
        {t("retention.purgeAll")}
      </Button>
      {deleted != null && (
        <span className="text-xs text-muted-foreground">
          {t("retention.deleted", { count: deleted })}
        </span>
      )}
    </div>
  );
}
