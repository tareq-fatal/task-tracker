"use client";

import { useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { Check, Plus, Trash2, Square, CheckSquare } from "lucide-react";
import {
  addSubtaskAction,
  toggleSubtaskAction,
  deleteSubtaskAction,
} from "@/actions/tasks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type SubtaskItem = {
  id: string;
  title: string;
  done: boolean;
};

function Row({ sub, canDelete }: { sub: SubtaskItem; canDelete: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-secondary/50">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await toggleSubtaskAction(sub.id);
          })
        }
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="toggle"
      >
        {sub.done ? (
          <CheckSquare className="h-5 w-5 text-emerald-600" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </button>
      <span
        className={cn(
          "flex-1 text-sm",
          sub.done && "text-muted-foreground line-through"
        )}
      >
        {sub.title}
      </span>
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deleteSubtaskAction(sub.id);
            })
          }
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label="delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function SubtaskList({
  taskId,
  subtasks,
  canDelete = false,
}: {
  taskId: string;
  subtasks: SubtaskItem[];
  /** Deletion is admin-only (2026-08-02) — non-admins never see the trash icon. */
  canDelete?: boolean;
}) {
  const { t } = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const action = addSubtaskAction.bind(null, taskId);
  const [, formAction] = useFormState(action, {});

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <div className="space-y-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("task.subtasks")}
        </span>
        {subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3 w-3" />
            {doneCount}/{subtasks.length}
          </span>
        )}
      </div>

      {subtasks.length === 0 && (
        <p className="px-1 py-2 text-sm text-muted-foreground">
          {t("task.noSubtasks")}
        </p>
      )}

      {subtasks.map((s) => (
        <Row key={s.id} sub={s} canDelete={canDelete} />
      ))}

      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex items-center gap-2 pt-2"
      >
        <Input
          name="title"
          required
          maxLength={200}
          placeholder={t("task.addSubtask")}
          className="h-9"
        />
        <Button type="submit" size="icon" variant="outline" className="h-9 w-9 shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
