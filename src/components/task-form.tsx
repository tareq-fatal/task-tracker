"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useT } from "@/components/i18n-provider";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_TYPES } from "@/lib/enums";
import type { TaskFormState } from "@/actions/tasks";
import type { TKey } from "@/lib/i18n";

type Option = { id: string; name: string };

export type TaskDefaults = {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedToUserId?: string | null;
  assigneeIds?: string[]; // co-assignees (excluding the primary), #13
  projectId?: string | null;
  teamId?: string | null;
  dueDate?: string | null; // yyyy-MM-dd
  estimatedHours?: string; // shorthand e.g. "4h" / "1d"
  spentHours?: string;
  recurrence?: string; // none | daily | weekly | monthly
  type?: string; // Epic | Story | Task | Subtask | Bug
  storyPoints?: string;
  parentId?: string | null;
};

type ParentOption = { id: string; title: string };

const RECURRENCE_PRESETS = ["none", "daily", "weekly", "monthly"] as const;

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function TaskForm({
  action,
  users,
  projects,
  teams,
  parents = [],
  defaults,
  submitLabel,
  canAssign = true,
  isEdit = false,
}: {
  action: (prev: TaskFormState, fd: FormData) => Promise<TaskFormState>;
  users: Option[];
  projects: Option[];
  teams: Option[];
  parents?: ParentOption[];
  defaults?: TaskDefaults;
  submitLabel: string;
  canAssign?: boolean;
  isEdit?: boolean;
}) {
  const { t } = useT();
  const [state, formAction] = useFormState(action, {});
  const d = defaults ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">{t("task.title")} *</Label>
        <Input
          id="title"
          name="title"
          defaultValue={d.title}
          required
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>{t("task.description")}</Label>
        <RichTextEditor
          name="description"
          defaultValue={d.description}
          placeholder={t("editor.placeholder")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">{t("task.status")}</Label>
          <select
            id="status"
            name="status"
            defaultValue={d.status ?? "Todo"}
            className={selectClass}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as TKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">{t("task.priority")}</Label>
          <select
            id="priority"
            name="priority"
            defaultValue={d.priority ?? "Medium"}
            className={selectClass}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}` as TKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">{t("task.type")}</Label>
          <select id="type" name="type" defaultValue={d.type ?? "Task"} className={selectClass}>
            {TASK_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`type.${ty}` as TKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="storyPoints">{t("task.storyPoints")}</Label>
          <Input
            id="storyPoints"
            name="storyPoints"
            type="number"
            min={0}
            defaultValue={d.storyPoints ?? ""}
            placeholder="—"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="parentId">{t("task.parent")}</Label>
          <select id="parentId" name="parentId" defaultValue={d.parentId ?? ""} className={selectClass}>
            <option value="">{t("task.noParent")}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {canAssign && (
          <div className="space-y-2">
            <Label htmlFor="assignedToUserId">{t("task.primaryAssignee")}</Label>
            <select
              id="assignedToUserId"
              name="assignedToUserId"
              defaultValue={d.assignedToUserId ?? ""}
              className={selectClass}
            >
              <option value="">{t("task.unassigned")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {/* #13 — additional co-assignees (the primary above is the Hauptkopf) */}
            <p className="pt-1 text-xs font-medium text-muted-foreground">
              {t("task.coAssignees")}
            </p>
            <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {users.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    name="assigneeIds"
                    value={u.id}
                    defaultChecked={d.assigneeIds?.includes(u.id) ?? false}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="projectId">{t("task.project")}</Label>
          <select
            id="projectId"
            name="projectId"
            defaultValue={d.projectId ?? ""}
            className={selectClass}
          >
            <option value="">{t("task.noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="teamId">{t("task.team")}</Label>
          <select
            id="teamId"
            name="teamId"
            defaultValue={d.teamId ?? ""}
            className={selectClass}
          >
            <option value="">{t("task.noTeam")}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dueDate">{t("task.dueDate")}</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={d.dueDate ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recurrence">{t("task.recurrence")}</Label>
          <select
            id="recurrence"
            name="recurrence"
            defaultValue={d.recurrence ?? "none"}
            className={selectClass}
          >
            {RECURRENCE_PRESETS.map((r) => (
              <option key={r} value={r}>
                {t(`recurrence.${r}` as TKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="estimatedHours">{t("task.planned")}</Label>
          <Input
            id="estimatedHours"
            name="estimatedHours"
            defaultValue={d.estimatedHours ?? ""}
            placeholder="2h30m"
          />
          <p className="text-xs text-muted-foreground">{t("task.timeHint")}</p>
        </div>

        {/* "Spent" (actual) time only when editing — it's auto-tracked by the timer,
            never entered at creation. */}
        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="spentHours">{t("task.spent")}</Label>
            <Input
              id="spentHours"
              name="spentHours"
              defaultValue={d.spentHours ?? ""}
              placeholder="2h"
            />
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-sm font-medium text-destructive">
          {state.error === "BLOCKED" ? t("task.blocked") : state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}
