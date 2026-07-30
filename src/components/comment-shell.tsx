"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SmilePlus, Trash2, RotateCcw, Loader2 } from "lucide-react";
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

/**
 * Toolbar under one (server-rendered) comment. Customer-final UX
 * (2026-07-29, replaces the removed right-click/long-press menu):
 *  - reaction chips (visible to everyone; clickable for admins only)
 *  - a VISIBLE dezent 🗑️ icon for whoever may delete (author or admin —
 *    server-enforced too); click → confirmation modal → soft delete
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const react = (type: string) =>
    start(async () => {
      await toggleReactionAction(commentId, type).catch(() => {});
      setPickerOpen(false);
      router.refresh();
    });

  return (
    <div className="group flex-1">
      {children}

      {/* Toolbar: reactions (start) + delete icon (end) */}
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
              className="rounded-full border bg-card p-1 text-muted-foreground transition-colors hover:bg-secondary"
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

        {/* Visible, discoverable delete — dezent grey, red on hover */}
        {canDelete && (
          <button
            onClick={() => setConfirmOpen(true)}
            aria-label={t("comments.delete")}
            title={t("comments.delete")}
            className="ms-auto rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

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
