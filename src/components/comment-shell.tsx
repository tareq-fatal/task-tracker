"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, SmilePlus, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import {
  toggleReactionAction,
  deleteCommentAction,
  restoreCommentAction,
} from "@/actions/comments";
import {
  REACTION_TYPES,
  REACTION_EMOJI,
  type ReactionChip,
} from "@/lib/comment-reactions";

const LONG_PRESS_MS = 500;

/**
 * Client wrapper around one (server-rendered) comment body:
 *  - reaction chips below (👍 3 · 👁 5, own reactions highlighted, names in
 *    the tooltip) + a picker via the hover "+" button
 *  - desktop right-click / mobile long-press opens a context menu with
 *    delete (author/admin only), react and copy-text
 *  - delete confirms first, is a SOFT delete, and admins get restore on the
 *    grey "deleted" placeholder (rendered by the server page, not here)
 */
export function CommentShell({
  commentId,
  chips,
  canDelete,
  canReact = false,
  children,
}: {
  commentId: string;
  chips: ReactionChip[];
  canDelete: boolean;
  /** Admin-only for now (customer decision) — non-admins see chips read-only. */
  canReact?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const router = useRouter();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const react = (type: string) =>
    start(async () => {
      await toggleReactionAction(commentId, type).catch(() => {});
      setPickerOpen(false);
      setMenuAt(null);
      router.refresh();
    });

  function openMenu(x: number, y: number) {
    // Clamp so the menu never renders off-screen on mobile.
    setMenuAt({ x: Math.min(x, window.innerWidth - 190), y: Math.min(y, window.innerHeight - 170) });
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        const t0 = e.touches[0];
        pressTimer.current = setTimeout(() => openMenu(t0.clientX, t0.clientY), LONG_PRESS_MS);
      }}
      onTouchEnd={() => pressTimer.current && clearTimeout(pressTimer.current)}
      onTouchMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
      className="group"
    >
      <div ref={bodyRef}>{children}</div>

      {/* Reactions row */}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {chips.map((c) =>
          canReact ? (
            <button
              key={c.type}
              disabled={pending}
              onClick={() => react(c.type)}
              title={c.names.join("، ")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                c.mine
                  ? "border-indigo-300 bg-indigo-500/10 text-indigo-700"
                  : "bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              <span>{REACTION_EMOJI[c.type]}</span>
              <span className="tabular-nums">{c.count}</span>
            </button>
          ) : (
            <span
              key={c.type}
              title={c.names.join("، ")}
              className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground"
            >
              <span>{REACTION_EMOJI[c.type]}</span>
              <span className="tabular-nums">{c.count}</span>
            </span>
          )
        )}
        {canReact && (
        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            aria-label={t("comments.addReaction")}
            className={cn(
              "rounded-full border bg-card p-1 text-muted-foreground transition-opacity hover:bg-secondary",
              chips.length === 0 && "opacity-0 group-hover:opacity-100 focus:opacity-100"
            )}
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {pickerOpen && (
            <div className="absolute bottom-7 start-0 z-40 flex gap-1 rounded-full border bg-background p-1 shadow-lg">
              {REACTION_TYPES.map((type) => (
                <button
                  key={type}
                  disabled={pending}
                  onClick={() => react(type)}
                  className="rounded-full px-1.5 py-0.5 text-base hover:bg-secondary"
                >
                  {REACTION_EMOJI[type]}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Context menu */}
      {menuAt && (
        <>
          <button
            aria-label={t("nav.close")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setMenuAt(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuAt(null);
            }}
          />
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-xl border bg-background py-1 text-sm shadow-2xl"
            style={{ left: menuAt.x, top: menuAt.y }}
          >
            {canReact && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-secondary"
                onClick={() => {
                  setMenuAt(null);
                  setPickerOpen(true);
                }}
              >
                <SmilePlus className="h-4 w-4" /> {t("comments.addReaction")}
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(bodyRef.current?.innerText ?? "");
                } catch {}
                setMenuAt(null);
              }}
            >
              <Copy className="h-4 w-4" /> {t("comments.copy")}
            </button>
            {canDelete && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setMenuAt(null);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("comments.delete")}
              </button>
            )}
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button aria-label={t("nav.close")} className="absolute inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
            <p className="text-sm">{t("comments.confirmDelete")}</p>
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
                    await deleteCommentAction(commentId).catch(() => {});
                    setConfirmOpen(false);
                    router.refresh();
                  })
                }
              >
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Trash2 className="me-1 h-4 w-4" />}
                {t("comments.delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Admin-only restore button on the grey "comment was deleted" placeholder. */
export function RestoreCommentButton({ commentId }: { commentId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await restoreCommentAction(commentId).catch(() => {});
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
      {t("deleted.restore")}
    </button>
  );
}
