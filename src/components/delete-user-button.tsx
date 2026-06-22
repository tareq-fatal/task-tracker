"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteUserAction } from "@/actions/users";
import { Button } from "@/components/ui/button";

export function DeleteUserButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this user?")) return;
        startTransition(() => deleteUserAction(userId));
      }}
      aria-label="Delete user"
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
