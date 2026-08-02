"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllReadAction } from "@/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllReadAction();
          router.refresh();
        })
      }
    >
      <CheckCheck className="me-1 h-4 w-4" />
      {label}
    </Button>
  );
}
