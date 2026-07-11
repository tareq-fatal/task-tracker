"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import { ExportButtons } from "@/components/infographic-export";
import { formatHoursMinutes, groupTotals, parseDayKey, type TimesheetEntry } from "@/lib/timesheet";
import { formatMinutes } from "@/lib/time-tracking";
import type { TimeEntryWire } from "@/lib/time-queries";

export type TimeGroupBy = "user" | "project" | "sprint";
type BillableFilter = "all" | "billable" | "nonBillable";

export function TimeReport({
  entries: wire,
  fromDay,
  toDay,
  groupBy,
  filters,
  users,
  projects,
  sprints,
}: {
  entries: TimeEntryWire[];
  fromDay: string; // local "YYYY-MM-DD"
  toDay: string;
  groupBy: TimeGroupBy;
  filters: { user: string; project: string; sprint: string };
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [billableFilter, setBillableFilter] = useState<BillableFilter>("all");

  const entries = useMemo(
    () =>
      wire.map(
        (e) =>
          ({ ...e, startedAt: new Date(e.startedAt), endedAt: e.endedAt ? new Date(e.endedAt) : null }) as TimesheetEntry &
            TimeEntryWire
      ),
    [wire]
  );
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    if (billableFilter === "all") return entries;
    return entries.filter((e) => (billableFilter === "billable" ? e.billable : !e.billable));
  }, [entries, billableFilter]);

  const keyOf = (e: TimesheetEntry & TimeEntryWire) =>
    groupBy === "user" ? e.userId : groupBy === "project" ? e.projectId ?? "-" : e.sprintId ?? "-";
  const labelOf = (e: TimesheetEntry & TimeEntryWire) =>
    groupBy === "user"
      ? e.userName
      : groupBy === "project"
        ? e.projectName ?? t("timeReport.noProject")
        : e.sprintName ?? t("timeReport.noSprint");

  const rows = useMemo(() => groupTotals(filtered, now, keyOf, labelOf), [filtered, now, groupBy, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = rows[0]?.total ?? 0;
  const totals = rows.reduce(
    (a, r) => ({ billable: a.billable + r.billable, nonBillable: a.nonBillable + r.nonBillable, total: a.total + r.total }),
    { billable: 0, nonBillable: 0, total: 0 }
  );

  const push = (patch: Record<string, string>) => {
    const p = new URLSearchParams({
      from: fromDay,
      to: toDay,
      group: groupBy,
      ...(filters.user ? { user: filters.user } : {}),
      ...(filters.project ? { project: filters.project } : {}),
      ...(filters.sprint ? { sprint: filters.sprint } : {}),
    });
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`/reports/time?${p.toString()}`);
  };

  const selectCls = "h-9 rounded-md border bg-background px-3 text-sm";
  const range = `${(parseDayKey(fromDay) ?? now).toLocaleDateString(locale)} – ${(parseDayKey(toDay) ?? now).toLocaleDateString(locale)}`;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          defaultValue={fromDay}
          onChange={(e) => e.target.value && push({ from: e.target.value })}
          className={selectCls}
          aria-label={t("timeReport.from")}
        />
        <input
          type="date"
          defaultValue={toDay}
          onChange={(e) => e.target.value && push({ to: e.target.value })}
          className={selectCls}
          aria-label={t("timeReport.to")}
        />
        <select value={groupBy} onChange={(e) => push({ group: e.target.value })} className={selectCls} aria-label={t("timeReport.groupBy")}>
          <option value="user">{t("timeReport.byUser")}</option>
          <option value="project">{t("timeReport.byProject")}</option>
          <option value="sprint">{t("timeReport.bySprint")}</option>
        </select>
        <select value={filters.user} onChange={(e) => push({ user: e.target.value })} className={selectCls} aria-label={t("timesheet.user")}>
          <option value="">{t("timeReport.allUsers")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select value={filters.project} onChange={(e) => push({ project: e.target.value })} className={selectCls} aria-label={t("timeReport.byProject")}>
          <option value="">{t("timeReport.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filters.sprint} onChange={(e) => push({ sprint: e.target.value })} className={selectCls} aria-label={t("timeReport.bySprint")}>
          <option value="">{t("timeReport.allSprints")}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Billable filter (client-side) */}
        <div className="flex overflow-hidden rounded-md border text-sm">
          {(["all", "billable", "nonBillable"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setBillableFilter(f)}
              className={cn(
                "px-3 py-1.5 transition-colors",
                billableFilter === f ? "bg-indigo-500/15 font-medium text-indigo-700" : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {f === "all" ? t("timeReport.all") : f === "billable" ? t("time.billable") : t("time.nonBillable")}
            </button>
          ))}
        </div>

        <div className="ms-auto">
          <ExportButtons targetId="time-report-print" filename={`time-report-${fromDay}`} />
        </div>
      </div>

      {/* Printable report */}
      <div id="time-report-print" className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t("timeReport.title")}</h2>
            <p className="text-sm text-muted-foreground">{range}</p>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700">
              {t("time.billable")}: {formatHoursMinutes(totals.billable)} h
            </span>
            <span className="rounded-full bg-secondary px-3 py-1 font-medium text-muted-foreground">
              {t("time.nonBillable")}: {formatHoursMinutes(totals.nonBillable)} h
            </span>
            <span className="rounded-full bg-indigo-500/10 px-3 py-1 font-semibold text-indigo-700">
              {t("time.total")}: {formatHoursMinutes(totals.total)} h
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("time.noEntries")}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.key}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMinutes(r.total)}
                    {r.nonBillable > 0 && billableFilter === "all" && (
                      <span className="text-xs"> ({t("time.billable")}: {formatMinutes(r.billable)})</span>
                    )}
                  </span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                  {max > 0 && (
                    <>
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                        style={{ width: `${(r.billable / max) * 100}%` }}
                      />
                      <div className="h-full bg-muted-foreground/30" style={{ width: `${(r.nonBillable / max) * 100}%` }} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
