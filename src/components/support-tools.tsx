"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, AlertTriangle, HandHelping, GraduationCap } from "lucide-react";
import {
  escalateTaskAction,
  assistTaskAction,
  coachingNoteAction,
} from "@/actions/support";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

// #24 — admin-only support panel: escalate, assist (co-assign self), coaching note.
export function SupportTools({
  taskId,
  escalated,
  isAssisting,
}: {
  taskId: string;
  escalated: boolean;
  isAssisting: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
      <div className="mb-3 flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-semibold">{t("support.title")}</h3>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={escalated ? "outline" : "destructive"}
          disabled={pending}
          onClick={() => run(() => escalateTaskAction(taskId, !escalated))}
        >
          <AlertTriangle className="me-1 h-4 w-4" />
          {escalated ? t("support.deescalate") : t("support.escalate")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || isAssisting}
          onClick={() => run(() => assistTaskAction(taskId))}
        >
          <HandHelping className="me-1 h-4 w-4" />
          {isAssisting ? t("support.assisting") : t("support.assist")}
        </Button>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <GraduationCap className="h-3.5 w-3.5" />
          {t("support.coaching")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t("support.coachingPlaceholder")}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={pending || !note.trim()}
            onClick={() =>
              run(async () => {
                await coachingNoteAction(taskId, note);
                setNote("");
              })
            }
          >
            {t("support.sendCoaching")}
          </Button>
        </div>
      </div>
    </div>
  );
}
