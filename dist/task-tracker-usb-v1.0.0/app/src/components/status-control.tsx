"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatusAction } from "@/actions/tasks";
import { useT } from "@/components/i18n-provider";
import { TooltipHelp } from "@/components/ui/tooltip";
import { TASK_STATUSES } from "@/lib/enums";

// #36 — the one control an admin-assigned user always keeps: change the status.
export function StatusControl({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("task.status")}:</span>
      <TooltipHelp textKey="tooltip.change_status">
        <select
          aria-label={t("task.status")}
          value={status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            start(async () => {
              const res = await updateTaskStatusAction(taskId, next);
              if (res?.error === "BLOCKED") alert(t("task.blocked"));
              router.refresh();
            });
          }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {TASK_STATUSES.filter((s) => s !== "Archived").map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}` as never)}
            </option>
          ))}
        </select>
      </TooltipHelp>
    </label>
  );
}
