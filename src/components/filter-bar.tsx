"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, X, Search, ChevronDown, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type TaskFilters,
  filtersToParams,
  activeFilterCount,
  STATUS_GROUP_KEYS,
} from "@/lib/filters";
import { TASK_PRIORITIES } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

type Option = { id: string; name: string };
type FacetKey =
  | "project"
  | "team"
  | "assignee"
  | "status"
  | "priority"
  | "date"
  | "search";

const DATE_KEYS = ["today", "week", "month", "custom"] as const;

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FilterBar({
  basePath,
  projects,
  teams,
  users,
  current,
  hide = [],
  resultCount,
  totalCount,
}: {
  basePath: string;
  projects: Option[];
  teams: Option[];
  users: Option[];
  current: TaskFilters;
  hide?: FacetKey[];
  resultCount: number;
  totalCount: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState(current.q ?? "");

  const show = (k: FacetKey) => !hide.includes(k);
  const nameOf = (list: Option[], id?: string) =>
    list.find((o) => o.id === id)?.name ?? id ?? "";

  function apply(next: Partial<TaskFilters>) {
    const merged: TaskFilters = { ...current, ...next };
    const sp = filtersToParams(merged);
    const qs = sp.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  // debounce search
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = setTimeout(() => apply({ q: q || undefined }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function toggleAssignee(id: string) {
    const set = new Set(current.assignees);
    set.has(id) ? set.delete(id) : set.add(id);
    apply({ assignees: Array.from(set) });
  }

  const activeCount = activeFilterCount(current);

  /* ---- the control widgets (shared by desktop bar + mobile modal) ---- */
  function Controls() {
    return (
      <>
        {show("project") && (
          <select
            className={selectClass}
            value={current.project ?? ""}
            onChange={(e) => apply({ project: e.target.value || undefined })}
          >
            <option value="">{t("board.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {show("team") && (
          <select
            className={selectClass}
            value={current.team ?? ""}
            onChange={(e) => apply({ team: e.target.value || undefined })}
          >
            <option value="">{t("filter.allTeams")}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        )}

        {show("assignee") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Users className="h-4 w-4" />
                {t("task.assignee")}
                {current.assignees.length > 0 && (
                  <span className="rounded-full bg-sky-100 px-1.5 text-xs text-sky-700">
                    {current.assignees.length}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 overflow-y-auto">
              {users.map((u) => {
                const checked = current.assignees.includes(u.id);
                return (
                  <DropdownMenuItem
                    key={u.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleAssignee(u.id);
                    }}
                    className="gap-2"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        checked
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-input"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {u.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {show("status") && (
          <select
            className={selectClass}
            value={current.status ?? ""}
            onChange={(e) => apply({ status: (e.target.value || undefined) as any })}
          >
            <option value="">{t("task.status")}: {t("common.all")}</option>
            {STATUS_GROUP_KEYS.map((s) => (
              <option key={s} value={s}>
                {t(`filter.status.${s}` as TKey)}
              </option>
            ))}
          </select>
        )}

        {show("priority") && (
          <select
            className={selectClass}
            value={current.priority ?? ""}
            onChange={(e) => apply({ priority: e.target.value || undefined })}
          >
            <option value="">{t("task.priority")}: {t("common.all")}</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}` as TKey)}
              </option>
            ))}
          </select>
        )}

        {show("date") && (
          <select
            className={selectClass}
            value={current.date ?? ""}
            onChange={(e) =>
              apply({
                date: (e.target.value || undefined) as any,
                from: undefined,
                to: undefined,
              })
            }
          >
            <option value="">{t("filter.date.label")}: {t("common.all")}</option>
            {DATE_KEYS.map((d) => (
              <option key={d} value={d}>
                {t(`filter.date.${d}` as TKey)}
              </option>
            ))}
          </select>
        )}

        {show("date") && current.date === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              className="h-9 w-auto"
              value={current.from ?? ""}
              onChange={(e) => apply({ from: e.target.value || undefined })}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              className="h-9 w-auto"
              value={current.to ?? ""}
              onChange={(e) => apply({ to: e.target.value || undefined })}
            />
          </div>
        )}
      </>
    );
  }

  /* ---- active filter chips ---- */
  function chips() {
    const list: { key: string; label: string; onRemove: () => void }[] = [];
    if (current.project)
      list.push({
        key: "project",
        label: nameOf(projects, current.project),
        onRemove: () => apply({ project: undefined }),
      });
    if (current.team)
      list.push({
        key: "team",
        label: nameOf(teams, current.team),
        onRemove: () => apply({ team: undefined }),
      });
    current.assignees.forEach((id) =>
      list.push({
        key: `a-${id}`,
        label: nameOf(users, id),
        onRemove: () => toggleAssignee(id),
      })
    );
    if (current.status)
      list.push({
        key: "status",
        label: t(`filter.status.${current.status}` as TKey),
        onRemove: () => apply({ status: undefined }),
      });
    if (current.priority)
      list.push({
        key: "priority",
        label: t(`priority.${current.priority}` as TKey),
        onRemove: () => apply({ priority: undefined }),
      });
    if (current.date)
      list.push({
        key: "date",
        label: t(`filter.date.${current.date}` as TKey),
        onRemove: () => apply({ date: undefined, from: undefined, to: undefined }),
      });
    if (current.q)
      list.push({
        key: "q",
        label: `“${current.q}”`,
        onRemove: () => {
          setQ("");
          apply({ q: undefined });
        },
      });
    return list;
  }

  const activeChips = chips();

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* search */}
        {show("search") && (
          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="ps-9"
            />
          </div>
        )}

        {/* desktop inline controls */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <Controls />
        </div>

        {/* mobile filter button */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 md:hidden"
          onClick={() => setMobileOpen(true)}
        >
          <Filter className="me-1 h-4 w-4" />
          {t("common.filters")}
          {activeCount > 0 && (
            <span className="ms-1 rounded-full bg-sky-100 px-1.5 text-xs text-sky-700">
              {activeCount}
            </span>
          )}
        </Button>

        {/* result counter */}
        <span className="ms-auto whitespace-nowrap text-sm text-muted-foreground">
          {t("filter.results", { shown: resultCount, total: totalCount })}
        </span>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setQ("");
              router.push(basePath);
            }}
          >
            <X className="me-1 h-4 w-4" />
            {t("common.clear")}
          </Button>
        )}
      </div>

      {/* active chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-secondary/70"
            >
              {c.label}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* mobile modal */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("common.filters")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Controls />
            <Button onClick={() => setMobileOpen(false)} className="mt-2">
              {t("filter.apply")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
