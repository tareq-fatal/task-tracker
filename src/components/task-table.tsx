"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpDown, Rows3, Rows4 } from "lucide-react";
import { sortTasks, type SortKey, type SortDir } from "@/lib/table-sort";
import { dueBucket } from "@/lib/due";
import { formatDate } from "@/lib/format";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { TagChips, flattenTags } from "@/components/tag-chips";
import {
  BulkActionBar,
  type NamedOption,
  type SprintOption,
} from "@/components/bulk-action-bar";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = {
  id: string; title: string; status: string; priority: string;
  dueDate: string | Date | null; storyPoints?: number | null; assignedTo: { name: string } | null;
  tags?: { tag: { name: string; color: string } }[];
};

const DUE_COLOR = { overdue: "text-rose-600", today: "text-orange-600", week: "text-sky-600", far: "text-muted-foreground" };

export function TaskTable({
  rows,
  isAdmin = false,
  users = [],
  sprints = [],
  tagSuggestions = [],
}: {
  rows: Row[];
  isAdmin?: boolean;
  users?: NamedOption[];
  sprints?: SprintOption[];
  tagSuggestions?: string[];
}) {
  const { t, locale } = useT();
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dense, setDense] = useState(true);
  const sel = useBulkSelection();

  const sorted = useMemo(() => sortTasks(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const orderedIds = useMemo(() => sorted.map((r) => r.id), [sorted]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }
  const allSelected = sorted.length > 0 && sel.count === sorted.length;
  function toggleAll() { sel.setAll(orderedIds, !allSelected); }

  const cols: { key: SortKey; label: string }[] = [
    { key: "title", label: t("task.title" as never) },
    { key: "status", label: t("task.status") },
    { key: "assignee", label: t("task.assignee") },
    { key: "dueDate", label: t("task.dueDate") },
    { key: "priority", label: t("task.priority") },
    { key: "storyPoints", label: t("task.storyPoints") },
  ];
  const pad = dense ? "py-1.5" : "py-3";

  if (rows.length === 0) return <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("list.empty")}</p>;

  return (
    <div className="pb-24">
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setDense((d) => !d)} title={t("list.density")}>
          {dense ? <Rows4 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" aria-label="select all" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-indigo-600" />
              </th>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2 text-start font-semibold">
                  <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3", sortKey === c.key ? "text-indigo-500" : "opacity-40")} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const bucket = r.status === "Done" || r.status === "Archived" ? null : dueBucket(r.dueDate, new Date());
              const selected = sel.isSelected(r.id);
              return (
                <tr key={r.id} className={cn("border-t hover:bg-muted/30", selected && "bg-indigo-50/50")} data-testid="list-row">
                  <td className={cn("px-3", pad)}>
                    <input
                      type="checkbox"
                      aria-label={`select ${r.title}`}
                      checked={selected}
                      readOnly
                      onClick={(e) => sel.toggle(r.id, { shiftKey: e.shiftKey, orderedIds })}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </td>
                  <td className={cn("px-3", pad)}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/tasks/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                      <TagChips tags={flattenTags(r.tags)} />
                    </div>
                  </td>
                  <td className={cn("px-3", pad)}><StatusBadge status={r.status} /></td>
                  <td className={cn("px-3", pad)}>{r.assignedTo?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className={cn("px-3 tabular-nums", pad, bucket && DUE_COLOR[bucket])}>{r.dueDate ? formatDate(r.dueDate, locale) : "—"}</td>
                  <td className={cn("px-3", pad)}><PriorityBadge priority={r.priority} /></td>
                  <td className={cn("px-3 tabular-nums", pad)}>{r.storyPoints ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <BulkActionBar
        ids={sel.ids}
        onCleared={sel.clear}
        isAdmin={isAdmin}
        users={users}
        sprints={sprints}
        tagSuggestions={tagSuggestions}
      />
    </div>
  );
}
