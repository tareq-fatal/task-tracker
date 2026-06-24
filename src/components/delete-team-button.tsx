"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTeamAction } from "@/actions/teams";
import { Button } from "@/components/ui/button";

export function DeleteTeamButton({
  teamId,
  label,
  confirmText,
}: {
  teamId: string;
  label: string;
  confirmText: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        startTransition(() => deleteTeamAction(teamId));
      }}
    >
      <Trash2 className="me-1 h-4 w-4 text-destructive" />
      {label}
    </Button>
  );
}
