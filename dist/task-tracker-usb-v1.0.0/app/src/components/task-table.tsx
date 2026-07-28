"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Rows3, Rows4, Trash2, X } from "lucide-react";
import { sortTasks, type SortKey, type SortDir } from "@/lib/table-sort";
import { sortKeyFor, displayValue, type FieldType } from "@/lib/custom-fields";
import { dueBucket } from "@/lib/due";
import { formatDate } from "@/lib/format";
import { TASK_STATUSES } from "@/lib/enums";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { bulkSetStatusAction, bulkDeleteAction } from "@/actions/bulk";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CustomCol = { id: string; name: string; type: FieldType; options: string[] };

type Row = {
  id: string; title: string; status: string; priority: string;
  dueDate: string | Date | null; storyPoints?: number | null; assignedTo: { name: string } | null;
  custom?: Record<string, string>;
};

const DUE_COLOR = { overdue: "text-rose-600", today: "text-orange-600", week: "text-sky-600", far: "text-muted-foreground" };

export function TaskTable({
  rows, customFields = [], userNames = {},
}: {
  rows: Row[];
  customFields?: CustomCol[];
  userNames?: Record<string, string>;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  // sortKey is either a built-in SortKey or "cf:<fieldId>".
  const [sortKey, setSortKey] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dense, setDense] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const activeFilter = customFields.find((f) => f.id === filterField);

  const filtered = useMemo(() => {
    if (!activeFilter) return rows;
    const q = filterValue.trim().toLowerCase();
    if (q === "") return rows;
    return rows.filter((r) => {
      const raw = r.custom?.[activeFilter.id] ?? "";
      switch (activeFilter.type) {
        case "checkbox": return (raw === "true" ? "true" : "false") === q;
        case "user": return raw.toLowerCase() === q;
        case "select": return raw.toLowerCase() === q;
        default: return raw.toLowerCase().includes(q); // text / number / date
      }
    });
  }, [rows, activeFilter, filterValue]);

  const sorted = useMemo(() => {
    if (sortKey.startsWith("cf:")) {
      const id = sortKey.slice(3);
      const field = customFields.find((f) => f.id === id);
      if (!field) return filtered;
      const sign = sortDir === "asc" ? 1 : -1;
      return filtered
        .map((r, i) => [r, i] as const)
        .sort(([a, ai], [b, bi]) => {
          const va = sortKeyFor(field.type, a.custom?.[id] ?? "", userNames);
          const vb = sortKeyFor(field.type, b.custom?.[id] ?? "", userNames);
          if (va < vb) return -1 * sign;
          if (va > vb) return 1 * sign;
          return ai - bi; // stable
        })
        .map(([r]) => r);
    }
    return sortTasks(filtered, sortKey as SortKey, sortDir);
  }, [filtered, sortKey, sortDir, customFields, userNames]);

  function toggleSort(k: string) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }
  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allSelected = sorted.length > 0 && sorted.every((r) => sel.has(r.id));
  function toggleAll() { setSel(allSelected ? new Set() : new Set(sorted.map((r) => r.id))); }

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); setSel(new Set()); router.refresh(); });

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
    <div className="pb-20">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {/* Filter by a custom field */}
        {customFields.length > 0 && (
          <div className="me-auto flex flex-wrap items-center gap-2">
            <select
              aria-label={t("cf.filterBy")} value={filterField}
              onChange={(e) => { setFilterField(e.target.value); setFilterValue(""); }}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">{t("cf.filterBy")}…</option>
              {customFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {activeFilter && (activeFilter.type === "select" ? (
              <select aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                <option value="">{t("cf.any")}</option>
                {activeFilter.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : activeFilter.type === "user" ? (
              <select aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                <option value="">{t("cf.any")}</option>
                {Object.entries(userNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            ) : activeFilter.type === "checkbox" ? (
              <select aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                <option value="">{t("cf.any")}</option>
                <option value="true">✓</option>
                <option value="false">—</option>
              </select>
            ) : (
              <input
                aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)}
                placeholder={t("cf.filterValue")} className="h-8 w-40 rounded-md border bg-background px-2 text-sm"
                type={activeFilter.type === "date" ? "date" : activeFilter.type === "number" ? "number" : "text"}
              />
            ))}
            {activeFilter && filterValue && (
              <button aria-label={t("cf.clearFilter")} onClick={() => setFilterValue("")} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            )}
          </div>
        )}
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
              {customFields.map((f) => (
                <th key={f.id} className="whitespace-nowrap px-3 py-2 text-start font-semibold">
                  <button onClick={() => toggleSort(`cf:${f.id}`)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {f.name}
                    <ArrowUpDown className={cn("h-3 w-3", sortKey === `cf:${f.id}` ? "text-indigo-500" : "opacity-40")} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const bucket = r.status === "Done" || r.status === "Archived" ? null : dueBucket(r.dueDate, new Date());
              return (
                <tr key={r.id} className={cn("border-t hover:bg-muted/30", sel.has(r.id) && "bg-indigo-50/50")} data-testid="list-row">
                  <td className={cn("px-3", pad)}>
                    <input type="checkbox" aria-label={`select ${r.title}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-indigo-600" />
                  </td>
                  <td className={cn("px-3", pad)}><Link href={`/tasks/${r.id}`} className="font-medium hover:underline">{r.title}</Link></td>
                  <td className={cn("px-3", pad)}><StatusBadge status={r.status} /></td>
                  <td className={cn("px-3", pad)}>{r.assignedTo?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className={cn("px-3 tabular-nums", pad, bucket && DUE_COLOR[bucket])}>{r.dueDate ? formatDate(r.dueDate, locale) : "—"}</td>
                  <td className={cn("px-3", pad)}><PriorityBadge priority={r.priority} /></td>
                  <td className={cn("px-3 tabular-nums", pad)}>{r.storyPoints ?? "—"}</td>
                  {customFields.map((f) => (
                    <td key={f.id} className={cn("whitespace-nowrap px-3", pad, (f.type === "number" || f.type === "date") && "tabular-nums")}>
                      {displayValue(f.type, r.custom?.[f.id] ?? "", userNames)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk toolbar */}
      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">{t("list.selected", { n: sel.size })}</span>
          <select
            aria-label={t("list.setStatus")} defaultValue="" disabled={pending}
            onChange={(e) => { if (e.target.value) run(() => bulkSetStatusAction([...sel], e.target.value)); }}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">{t("list.setStatus")}…</option>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
          </select>
          <Button size="sm" variant="destructive" disabled={pending}
            onClick={() => { if (confirm(t("list.deleteConfirm", { n: sel.size }))) run(() => bulkDeleteAction([...sel])); }}>
            <Trash2 className="me-1 h-4 w-4" /> {t("list.delete")}
          </Button>
          <button aria-label="clear selection" onClick={() => setSel(new Set())} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
