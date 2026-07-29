"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { deleteAttachmentAction } from "@/actions/comments";

const LONG_PRESS_MS = 500;

/** Context menu (right-click / long-press) around one attachment tile:
 *  download, copy link, delete (uploader/admin — soft delete). */
export function AttachmentShell({
  attachmentId,
  downloadHref,
  canDelete,
  children,
}: {
  attachmentId: string;
  downloadHref: string;
  canDelete: boolean;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const router = useRouter();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Long-press ghost-click guard: after the menu opens under a finger, the
  // touchend still synthesizes a click that would land on the backdrop and
  // close the menu instantly ("menu flashes and disappears"). We suppress the
  // click after a fired long-press and ignore backdrop clicks for 400 ms.
  const longPressFired = useRef(false);
  const openedAtRef = useRef(0);

  function openMenu(x: number, y: number) {
    openedAtRef.current = Date.now();
    setMenuAt({ x: Math.min(x, window.innerWidth - 190), y: Math.min(y, window.innerHeight - 150) });
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        const t0 = e.touches[0];
        longPressFired.current = false;
        pressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          openMenu(t0.clientX, t0.clientY);
        }, LONG_PRESS_MS);
      }}
      onTouchEnd={(e) => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        if (longPressFired.current) {
          // kill the synthetic click that follows this touchend
          e.preventDefault();
          longPressFired.current = false;
        }
      }}
      onTouchMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
      onClickCapture={(e) => {
        // any stray click right after a long-press open must not reach
        // links/buttons underneath or the backdrop
        if (
          Date.now() - openedAtRef.current < 400 &&
          !(e.target as HTMLElement).closest("[data-ctx-menu]")
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={{ WebkitTouchCallout: "none" }}
    >
      {children}

      {menuAt && (
        <>
          <button
            aria-label={t("nav.close")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => {
              if (Date.now() - openedAtRef.current < 400) return; // ghost click
              setMenuAt(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuAt(null);
            }}
          />
          <div
            data-ctx-menu
            className="fixed z-50 overflow-hidden border bg-background text-sm shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)] max-sm:pt-2 max-sm:text-base sm:w-44 sm:rounded-xl sm:py-1"
            style={typeof window !== "undefined" && window.innerWidth >= 640 ? { left: menuAt.x, top: menuAt.y } : undefined}
          >
            <a
              href={downloadHref}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-secondary"
              onClick={() => setMenuAt(null)}
            >
              <Download className="h-4 w-4" /> {t("attachments.download")}
            </a>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(new URL(downloadHref, location.origin).toString());
                } catch {}
                setMenuAt(null);
              }}
            >
              <Copy className="h-4 w-4" /> {t("attachments.copyLink")}
            </button>
            {canDelete && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setMenuAt(null);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("attachments.delete")}
              </button>
            )}
          </div>
        </>
      )}

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
    </div>
  );
}
