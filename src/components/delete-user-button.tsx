"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteUserAction } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import { useT } from "@/components/i18n-provider";

export function DeleteUserButton({ userId }: { userId: string }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  return (
    <TooltipHelp textKey="tooltip.delete_user">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pending}
        onClick={() => {
          if (!confirm(t("admin.users.deleteConfirm"))) return;
          startTransition(() => deleteUserAction(userId));
        }}
        aria-label={t("admin.users.delete")}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </TooltipHelp>
  );
}
