"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/enums";
import type { TaskFormState } from "@/actions/tasks";
import type { TKey } from "@/lib/i18n";

type Option = { id: string; name: string };

export type TaskDefaults = {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedToUserId?: string | null;
  projectId?: string | null;
  dueDate?: string | null; // yyyy-MM-dd
};

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
  defaults,
  submitLabel,
}: {
  action: (prev: TaskFormState, fd: FormData) => Promise<TaskFormState>;
  users: Option[];
  projects: Option[];
  defaults?: TaskDefaults;
  submitLabel: string;
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
        <Label htmlFor="description">{t("task.description")}</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={d.description}
          rows={4}
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
          <Label htmlFor="assignedToUserId">{t("task.assignee")}</Label>
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
        </div>

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

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="dueDate">{t("task.dueDate")}</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={d.dueDate ?? ""}
            className="sm:w-56"
          />
        </div>
      </div>

      {state.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2">
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}
