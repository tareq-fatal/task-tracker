"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Link2, Plus, X, ArrowRight } from "lucide-react";
import { addTaskLinkAction, removeTaskLinkAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/task-badges";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { TASK_LINK_TYPES } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

type LinkRow = {
  id: string;
  type: string;
  linkedTask: { id: string; title: string; status: string };
};
type IncomingRow = {
  id: string;
  type: string;
  task: { id: string; title: string; status: string };
};

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TaskLinks({
  taskId,
  links,
  incoming,
  candidates,
  canRemove = false,
}: {
  taskId: string;
  links: LinkRow[];
  incoming: IncomingRow[];
  candidates: { id: string; title: string }[];
  /** Removing links is admin-only (2026-08-02) — non-admins never see the X. */
  canRemove?: boolean;
}) {
  const { t } = useT();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const [type, setType] = useState<string>("DependsOn");
  const formRef = useRef<HTMLFormElement>(null);

  function add() {
    if (!linkedTaskId) return;
    startTransition(async () => {
      const res = await addTaskLinkAction(taskId, linkedTaskId, type);
      if (res.ok) {
        toast(t("common.saved"));
        setLinkedTaskId("");
      } else {
        toast(
          t(res.error === "CYCLE" ? "links.err.cycle" : "links.err.generic"),
          "error"
        );
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeTaskLinkAction(id);
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="h-4 w-4" />
        {t("links.title")}
      </h2>

      {links.length === 0 && incoming.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("links.none")}</p>
      )}

      <div className="space-y-2">
        {links.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 rounded-lg border bg-card p-2.5 text-sm"
          >
            <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {t(`links.type.${l.type}` as TKey)}
            </span>
            <Link
              href={`/tasks/${l.linkedTask.id}`}
              className="flex-1 truncate font-medium hover:underline"
            >
              {l.linkedTask.title}
            </Link>
            <StatusBadge status={l.linkedTask.status} />
            {canRemove && (
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(l.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="remove"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {incoming.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2.5 text-sm"
          >
            <Link
              href={`/tasks/${l.task.id}`}
              className="flex-1 truncate text-muted-foreground hover:underline"
            >
              {l.task.title}
            </Link>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              {t(`links.type.${l.type}` as TKey)}
            </span>
          </div>
        ))}
      </div>

      {candidates.length > 0 && (
        <form
          ref={formRef}
          action={() => add()}
          className="flex flex-wrap items-center gap-2 pt-1"
        >
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
          >
            {TASK_LINK_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`links.type.${ty}` as TKey)}
              </option>
            ))}
          </select>
          <select
            value={linkedTaskId}
            onChange={(e) => setLinkedTaskId(e.target.value)}
            className={`${selectClass} min-w-[10rem] flex-1`}
          >
            <option value="">{t("links.selectTask")}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !linkedTaskId}>
            <Plus className="me-1 h-4 w-4" />
            {t("links.add")}
          </Button>
        </form>
      )}
    </div>
  );
}
