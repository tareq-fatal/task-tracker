"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteVoiceNoteAction } from "@/actions/tasks";
import { useT } from "@/components/i18n-provider";

/** Admin-only delete for a task-level voice note (Kundenwunsch 2026-08-02).
 *  The page only renders this for admins; the server action re-checks. */
export function VoiceNoteDeleteButton({ voiceNoteId }: { voiceNoteId: string }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("voice.deleteConfirm"))) return;
        startTransition(async () => {
          await deleteVoiceNoteAction(voiceNoteId);
        });
      }}
      className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
      aria-label={t("voice.delete")}
      title={t("voice.delete")}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
