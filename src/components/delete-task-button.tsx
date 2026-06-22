"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTaskAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("task.deleteConfirm"))) return;
        startTransition(() => deleteTaskAction(taskId));
      }}
    >
      <Trash2 className="mr-1 h-4 w-4" />
      {t("task.delete")}
    </Button>
  );
}
