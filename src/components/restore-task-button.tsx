"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { restoreTaskAction } from "@/actions/tasks";

/** Admin-only: undo a soft delete — the task reappears everywhere with all
 *  its assignees, comments and progress intact. */
export function RestoreTaskButton({ taskId }: { taskId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await restoreTaskAction(taskId);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="me-1 h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="me-1 h-4 w-4" />
      )}
      {t("deleted.restore")}
    </Button>
  );
}
