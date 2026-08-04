"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatusAction } from "@/actions/tasks";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { TooltipHelp } from "@/components/ui/tooltip";
import { TASK_STATUSES } from "@/lib/enums";
import { statusGateMessageKey } from "@/lib/status-gate-messages";

// #36 — the one control an admin-assigned user always keeps: change the status.
// Admin-Workflow-Kontrolle (2026-08-04): mit gesetzter allowedTargetColumn
// zeigt das Select nur noch aktueller Status + erlaubte Ziel-Spalte — der
// Server erzwingt dieselbe Regel unabhängig davon.
export function StatusControl({
  taskId,
  status,
  allowedTargetColumn = null,
}: {
  taskId: string;
  status: string;
  allowedTargetColumn?: string | null;
}) {
  const { t } = useT();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const options = allowedTargetColumn
    ? TASK_STATUSES.filter((s) => s === status || s === allowedTargetColumn)
    : TASK_STATUSES.filter((s) => s !== "Archived");

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
              if (res && !res.ok) toast(t(statusGateMessageKey(res.error)), "error");
              router.refresh();
            });
          }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {options.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}` as never)}
            </option>
          ))}
        </select>
      </TooltipHelp>
    </label>
  );
}
