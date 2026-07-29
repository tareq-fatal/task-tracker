"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { deleteAttachmentAction } from "@/actions/comments";

/** Visible 🗑️ next to an attachment tile (uploader/admin only — server
 *  enforced). Confirms, then SOFT-deletes; the file's download URL 404s. */
export function AttachmentDeleteButton({ attachmentId }: { attachmentId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        aria-label={t("attachments.delete")}
        title={t("attachments.delete")}
        className="shrink-0 rounded p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button aria-label={t("nav.close")} className="absolute inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
            <p className="text-sm">{t("attachments.confirmDelete")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
                {t("project.delete.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteAttachmentAction(attachmentId).catch(() => {});
                    setConfirmOpen(false);
                    router.refresh();
                  })
                }
              >
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Trash2 className="me-1 h-4 w-4" />}
                {t("attachments.delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
