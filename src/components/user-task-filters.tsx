"use client";

import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { TASK_PRIORITIES } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function UserTaskFilters({
  basePath,
  projects,
  current,
}: {
  basePath: string;
  projects: { id: string; name: string }[];
  current: { project?: string; priority?: string; due?: string };
}) {
  const router = useRouter();
  const { t } = useT();

  function update(next: Partial<typeof current>) {
    const merged = { ...current, ...next };
    const sp = new URLSearchParams();
    if (merged.project) sp.set("project", merged.project);
    if (merged.priority) sp.set("priority", merged.priority);
    if (merged.due) sp.set("due", merged.due);
    const qs = sp.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hasFilters = current.project || current.priority || current.due;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
      <span className="flex items-center gap-1.5 ps-1 text-sm font-medium text-muted-foreground">
        <Filter className="h-4 w-4" />
        {t("common.filters")}
      </span>

      <select
        className={selectClass}
        value={current.project ?? ""}
        onChange={(e) => update({ project: e.target.value })}
      >
        <option value="">{t("task.project")}: {t("common.all")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={current.priority ?? ""}
        onChange={(e) => update({ priority: e.target.value })}
      >
        <option value="">{t("task.priority")}: {t("common.all")}</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {t(`priority.${p}` as TKey)}
          </option>
        ))}
      </select>

      <Input
        type="date"
        className="h-9 w-auto"
        value={current.due ?? ""}
        onChange={(e) => update({ due: e.target.value })}
        title={t("task.dueDate")}
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(basePath)}
          className="text-muted-foreground"
        >
          <X className="me-1 h-4 w-4" />
          {t("common.clear")}
        </Button>
      )}
    </div>
  );
}
