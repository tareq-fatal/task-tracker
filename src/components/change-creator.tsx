"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { changeCreatorAction } from "@/actions/tasks";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

// Admin-only: reassign a task's creator.
export function ChangeCreator({ taskId, users, currentCreatorId }: { taskId: string; users: { id: string; name: string }[]; currentCreatorId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState(currentCreatorId);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
        <UserCog className="h-3 w-3" /> {t("task.changeCreator")}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label={t("task.changeCreator")}
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-xs"
      >
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <Button
        size="sm"
        disabled={pending || sel === currentCreatorId}
        onClick={() => {
          if (!confirm(t("task.changeCreatorConfirm"))) return;
          start(async () => { await changeCreatorAction(taskId, sel); setOpen(false); router.refresh(); });
        }}
      >
        OK
      </Button>
    </span>
  );
}
