"use client";

import { useState, useMemo, useTransition, useEffect, useDeferredValue } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronLeft, ChevronRight, FolderTree, Rows3, Rows4, Search, Trash2, X } from "lucide-react";
import { sortTasks, type SortKey, type SortDir } from "@/lib/table-sort";
import { sortKeyFor, displayValue, type FieldType } from "@/lib/custom-fields";
import { dueBucket } from "@/lib/due";
import { formatDate } from "@/lib/format";
import { TASK_STATUSES } from "@/lib/enums";
import { StatusBadge, PriorityBadge, TagBadges } from "@/components/task-badges";
import { PRIORITY_DOT } from "@/components/task-row";
import { bulkSetStatusAction, bulkDeleteAction } from "@/actions/bulk";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

export type CustomCol = { id: string; name: string; type: FieldType; options: string[] };

type Row = {
  id: string; title: string; status: string; priority: string;
  dueDate: string | Date | null; storyPoints?: number | null; assignedTo: { name: string } | null;
  tags?: string[];
  custom?: Record<string, string>;
  project?: { name: string; color: string } | null;
  /** Bildanhänge für die Miniaturspalte (max 3, siehe /list). */
  images?: { id: string; fileName: string }[];
};

/** Zeilen nach Projekt bündeln — Projekte alphabetisch, „ohne Projekt" zuletzt. */
function groupByProject(rows: Row[]): { key: string; label: string; color: string | null; rows: Row[] }[] {
  const map = new Map<string, { key: string; label: string; color: string | null; rows: Row[] }>();
  for (const r of rows) {
    const key = r.project?.name ?? "";
    let g = map.get(key);
    if (!g) {
      g = { key, label: key, color: r.project?.color ?? null, rows: [] };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "") return 1;
    if (b.key === "") return -1;
    return a.label.localeCompare(b.label);
  });
}

const DUE_COLOR = {
  overdue: "font-medium text-red-700 dark:text-red-300",
  today: "font-medium text-orange-700 dark:text-orange-300",
  week: "text-foreground",
  far: "text-muted-foreground",
};

// TOF-0962: Statusfilter oben (Standard „Offen“) + Seiten à 50 Zeilen.
type StatusFilter = "open" | "InProgress" | "Done" | "all";
const PAGE_SIZE = 50;

export function TaskTable({
  rows, customFields = [], userNames = {}, canDelete = false,
}: {
  rows: Row[];
  customFields?: CustomCol[];
  userNames?: Record<string, string>;
  /** Bulk delete is admin-only (2026-08-02) — non-admins never see the button. */
  canDelete?: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  // sortKey is either a built-in SortKey or "cf:<fieldId>".
  const [sortKey, setSortKey] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dense, setDense] = useState(true);
  // Standardmäßig gruppiert: 164 Aufgaben am Stück sind eine Wurst, nach
  // Projekt sortiert sind es 19 überschaubare Blöcke (Tarek, 14.08.2026).
  const [grouped, setGrouped] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(0);

  const activeFilter = customFields.find((f) => f.id === filterField);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && !(r.status === "Todo" || r.status === "InProgress")) return false;
      if (status === "InProgress" && r.status !== "InProgress") return false;
      if (status === "Done" && r.status !== "Done") return false;
      if (q) {
        const hay = `${r.title} ${r.project?.name ?? ""} ${r.assignedTo?.name ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeFilter) {
        const fq = filterValue.trim().toLowerCase();
        if (fq !== "") {
          const raw = r.custom?.[activeFilter.id] ?? "";
          switch (activeFilter.type) {
            case "checkbox": if ((raw === "true" ? "true" : "false") !== fq) return false; break;
            case "user":
            case "select": if (raw.toLowerCase() !== fq) return false; break;
            default: if (!raw.toLowerCase().includes(fq)) return false; // text / number / date
          }
        }
      }
      return true;
    });
  }, [rows, status, deferredQuery, activeFilter, filterValue]);

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

  // Gruppiert: Reihenfolge nach Projekt, dann seitenweise schneiden.
  const ordered = useMemo(() => (grouped ? groupByProject(sorted).flatMap((g) => g.rows) : sorted), [grouped, sorted]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  useEffect(() => setPage(0), [status, deferredQuery, filterField, filterValue, grouped, sortKey, sortDir]);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = ordered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const showImages = rows.some((r) => (r.images?.length ?? 0) > 0);

  function toggleSort(k: string) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }
  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allSelected = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  function toggleAll() {
    setSel((s) => {
      const n = new Set(s);
      if (allSelected) pageRows.forEach((r) => n.delete(r.id));
      else pageRows.forEach((r) => n.add(r.id));
      return n;
    });
  }

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); setSel(new Set()); router.refresh(); });

  const cols: { key: SortKey; label: string; cls?: string }[] = [
    { key: "title", label: t("task.title" as never) },
    { key: "status", label: t("task.status"), cls: "hidden md:table-cell" },
    { key: "assignee", label: t("task.assignee"), cls: "hidden lg:table-cell" },
    { key: "dueDate", label: t("task.dueDate"), cls: "hidden sm:table-cell" },
    { key: "priority", label: t("task.priority"), cls: "hidden md:table-cell" },
    { key: "tags", label: t("task.tags"), cls: "hidden xl:table-cell" },
    { key: "storyPoints", label: t("task.storyPoints"), cls: "hidden xl:table-cell" },
  ];
  const pad = dense ? "py-2" : "py-3.5";
  const colCount = 1 + (showImages ? 1 : 0) + cols.length + customFields.length;

  const counts = useMemo(() => {
    let open = 0, prog = 0, done = 0;
    for (const r of rows) {
      if (r.status === "Todo" || r.status === "InProgress") open++;
      if (r.status === "InProgress") prog++;
      if (r.status === "Done") done++;
    }
    return { open, InProgress: prog, Done: done, all: rows.length };
  }, [rows]);
  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "open", label: t("list.f.open" as TKey) },
    { key: "InProgress", label: t("status.InProgress") },
    { key: "Done", label: t("status.Done") },
    { key: "all", label: t("list.f.all" as TKey) },
  ];

  function renderRow(r: Row) {
    const bucket = r.status === "Done" || r.status === "Archived" ? null : dueBucket(r.dueDate, new Date());
    return (
      <tr
        key={r.id}
        className={cn("cv-row border-t transition-colors hover:bg-accent/50", sel.has(r.id) && "bg-primary-soft/60")}
        data-testid="list-row"
        data-task-id={r.id}
      >
        <td className={cn("w-10 ps-3 pe-1 align-middle", pad)}>
          <label className="-m-2 inline-flex h-10 w-10 cursor-pointer items-center justify-center coarse:h-11 coarse:w-11">
            <input
              type="checkbox"
              aria-label={`select ${r.title}`}
              checked={sel.has(r.id)}
              onChange={() => toggle(r.id)}
              className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
            />
          </label>
        </td>
        {showImages && (
          <td className={cn("hidden px-2 md:table-cell", pad)}>
            {r.images && r.images.length > 0 ? (
              <span className="flex items-center -space-x-2 rtl:space-x-reverse">
                {r.images.slice(0, 3).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={`/download/attachment/${img.id}?thumb=1`}
                    alt={img.fileName}
                    title={img.fileName}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                    className={cn("shrink-0 rounded bg-secondary object-cover ring-2 ring-card", dense ? "h-7 w-7" : "h-9 w-9")}
                  />
                ))}
              </span>
            ) : null}
          </td>
        )}
        <td className={cn("px-3", pad)}>
          <div className="flex items-start gap-2.5">
            <span
              className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full md:hidden", PRIORITY_DOT[r.priority as TaskPriority] ?? "bg-slate-300")}
              aria-hidden
            />
            <div className="min-w-0">
              <Link href={`/tasks/${r.id}`} className="font-medium leading-snug text-foreground underline-offset-2 hover:underline">
                {r.title}
              </Link>
              {/* Handy: Status/Fälligkeit/Projekt unter dem Titel statt eigener Spalten */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground md:hidden">
                <StatusBadge status={r.status} />
                {r.dueDate && (
                  <span className={cn("tabular-nums sm:hidden", bucket && DUE_COLOR[bucket])}>{formatDate(r.dueDate, locale)}</span>
                )}
                {!grouped && r.project && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.project.color }} />
                    {r.project.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className={cn("hidden px-3 md:table-cell", pad)}><StatusBadge status={r.status} /></td>
        <td className={cn("hidden whitespace-nowrap px-3 lg:table-cell", pad)}>
          {r.assignedTo?.name ?? <span className="text-muted-foreground">—</span>}
        </td>
        <td className={cn("hidden whitespace-nowrap px-3 tabular-nums sm:table-cell", pad, bucket ? DUE_COLOR[bucket] : "text-muted-foreground")}>
          {r.dueDate ? formatDate(r.dueDate, locale) : "—"}
        </td>
        <td className={cn("hidden px-3 md:table-cell", pad)}><PriorityBadge priority={r.priority} /></td>
        <td className={cn("hidden px-3 xl:table-cell", pad)}>
          {r.tags && r.tags.length > 0 ? <TagBadges tags={r.tags} max={1} /> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={cn("hidden px-3 tabular-nums xl:table-cell", pad)}>{r.storyPoints ?? "—"}</td>
        {customFields.map((f) => (
          <td key={f.id} className={cn("hidden whitespace-nowrap px-3 lg:table-cell", pad, (f.type === "number" || f.type === "date") && "tabular-nums")}>
            {displayValue(f.type, r.custom?.[f.id] ?? "", userNames)}
          </td>
        ))}
      </tr>
    );
  }

  if (rows.length === 0) return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("list.empty")}</p>;

  const pageGroups = grouped ? groupByProject(pageRows) : null;
  const from = ordered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(ordered.length, (safePage + 1) * PAGE_SIZE);
  const selectCls = "h-9 rounded-lg border border-input bg-card px-2 text-sm shadow-card coarse:h-11";

  return (
    <div className="pb-24">
      {/* Werkzeugleiste: Suche · Status · Ansicht */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.searchPlaceholder" as TKey)}
            aria-label={t("list.searchPlaceholder" as TKey)}
            className="h-10 w-full rounded-lg border border-input bg-card pe-9 ps-9 text-sm shadow-card outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring coarse:h-11 coarse:text-base"
          />
          {query && (
            <button
              type="button"
              aria-label={t("cf.clearFilter")}
              onClick={() => setQuery("")}
              className="absolute end-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent coarse:h-10 coarse:w-10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div role="tablist" aria-label={t("task.status")} className="thin-scroll flex gap-1 overflow-x-auto rounded-lg bg-secondary p-1">
          {statusTabs.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={status === s.key}
              onClick={() => setStatus(s.key)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors coarse:h-10",
                status === s.key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
              <span className="tabular-nums text-xs text-muted-foreground">{counts[s.key]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ms-auto">
          {/* Filter nach Zusatzfeld */}
          {customFields.length > 0 && (
            <>
              <select
                aria-label={t("cf.filterBy")} value={filterField}
                onChange={(e) => { setFilterField(e.target.value); setFilterValue(""); }}
                className={selectCls}
              >
                <option value="">{t("cf.filterBy")}…</option>
                {customFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {activeFilter && (activeFilter.type === "select" ? (
                <select aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className={selectCls}>
                  <option value="">{t("cf.any")}</option>
                  {activeFilter.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : activeFilter.type === "user" ? (
                <select aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className={selectCls}>
                  <option value="">{t("cf.any")}</option>
                  {Object.entries(userNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              ) : activeFilter.type === "checkbox" ? (
                <select aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className={selectCls}>
                  <option value="">{t("cf.any")}</option>
                  <option value="true">✓</option>
                  <option value="false">—</option>
                </select>
              ) : (
                <input
                  aria-label={t("cf.filterValue")} value={filterValue} onChange={(e) => setFilterValue(e.target.value)}
                  placeholder={t("cf.filterValue")} className={cn(selectCls, "w-40")}
                  type={activeFilter.type === "date" ? "date" : activeFilter.type === "number" ? "number" : "text"}
                />
              ))}
              {activeFilter && filterValue && (
                <Button size="icon" variant="ghost" aria-label={t("cf.clearFilter")} onClick={() => setFilterValue("")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant={grouped ? "secondary" : "outline"} aria-pressed={grouped} onClick={() => setGrouped((g) => !g)}>
            <FolderTree className="h-4 w-4" /> {t("list.groupByProject")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDense((d) => !d)} title={t("list.density")} aria-label={t("list.density")}>
            {dense ? <Rows4 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 ps-3 pe-1 py-2.5">
                  <label className="-m-2 inline-flex h-10 w-10 cursor-pointer items-center justify-center">
                    <input type="checkbox" aria-label="select all" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded accent-[hsl(var(--primary))]" />
                  </label>
                </th>
                {showImages && <th className="hidden w-20 px-2 py-2.5 text-start font-medium md:table-cell">{t("list.preview")}</th>}
                {cols.map((c) => (
                  <th key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 text-start font-medium", c.cls)}>
                    <button onClick={() => toggleSort(c.key)} className="inline-flex min-h-8 items-center gap-1 rounded hover:text-foreground">
                      {c.label}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === c.key ? "text-primary" : "opacity-40")} />
                    </button>
                  </th>
                ))}
                {customFields.map((f) => (
                  <th key={f.id} className="hidden whitespace-nowrap px-3 py-2.5 text-start font-medium lg:table-cell">
                    <button onClick={() => toggleSort(`cf:${f.id}`)} className="inline-flex min-h-8 items-center gap-1 rounded hover:text-foreground">
                      {f.name}
                      <ArrowUpDown className={cn("h-3 w-3", sortKey === `cf:${f.id}` ? "text-primary" : "opacity-40")} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            {pageRows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {t("list.noMatch" as TKey)}
                  </td>
                </tr>
              </tbody>
            ) : pageGroups ? (
              pageGroups.map((g) => (
                <tbody key={g.key || "__none__"}>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={colCount} className="px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold">
                        {g.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />}
                        {g.label || t("list.noProject")}
                        <span className="font-normal tabular-nums text-muted-foreground">{g.rows.length}</span>
                      </span>
                    </td>
                  </tr>
                  {g.rows.map(renderRow)}
                </tbody>
              ))
            ) : (
              <tbody>{pageRows.map(renderRow)}</tbody>
            )}
          </table>
        </div>

        {/* Seiten */}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {t("list.page" as TKey, { from, to, n: ordered.length })}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={safePage === 0}
                onClick={() => { setPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0 }); }}
                aria-label={t("list.prev" as TKey)}
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                <span className="hidden sm:inline">{t("list.prev" as TKey)}</span>
              </Button>
              <span className="px-1 tabular-nums">{safePage + 1} / {pageCount}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={safePage >= pageCount - 1}
                onClick={() => { setPage((p) => Math.min(pageCount - 1, p + 1)); window.scrollTo({ top: 0 }); }}
                aria-label={t("list.next" as TKey)}
              >
                <span className="hidden sm:inline">{t("list.next" as TKey)}</span>
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Sammelaktionen */}
      {sel.size > 0 && (
        <div
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-2xl border bg-popover px-3 py-2 shadow-overlay md:bottom-6"
        >
          <span className="text-sm font-medium">{t("list.selected", { n: sel.size })}</span>
          <select
            aria-label={t("list.setStatus")} defaultValue="" disabled={pending}
            onChange={(e) => { if (e.target.value) run(() => bulkSetStatusAction([...sel], e.target.value)); }}
            className={selectCls}
          >
            <option value="">{t("list.setStatus")}…</option>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
          </select>
          {canDelete && (
            <Button size="sm" variant="destructive" disabled={pending}
              onClick={() => { if (confirm(t("list.deleteConfirm", { n: sel.size }))) run(() => bulkDeleteAction([...sel])); }}>
              <Trash2 className="h-4 w-4" /> {t("list.delete")}
            </Button>
          )}
          <Button size="icon" variant="ghost" aria-label="clear selection" onClick={() => setSel(new Set())}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
