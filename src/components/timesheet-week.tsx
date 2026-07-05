"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeEuro, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/infographic-export";
import { formatMinutes } from "@/lib/time-tracking";
import {
  addDays,
  buildWeekGrid,
  dayKey,
  entryMinutes,
  formatHoursMinutes,
  parseDayKey,
  weekDays,
  type TimesheetEntry,
} from "@/lib/timesheet";
import { deleteTimeEntryAction, toggleBillableAction } from "@/actions/time";
import type { TimeEntryWire } from "@/lib/time-queries";

function revive(e: TimeEntryWire): TimesheetEntry & TimeEntryWire {
  return { ...e, startedAt: new Date(e.startedAt), endedAt: e.endedAt ? new Date(e.endedAt) : null } as TimesheetEntry &
    TimeEntryWire;
}

export function TimesheetWeek({
  entries: wire,
  weekStartDay,
  userName,
  userId,
  tenantName,
  users,
  isAdmin,
}: {
  entries: TimeEntryWire[];
  weekStartDay: string; // local "YYYY-MM-DD" of the Monday
  userName: string;
  userId: string;
  tenantName: string;
  users: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  const weekStart = useMemo(() => parseDayKey(weekStartDay) ?? new Date(), [weekStartDay]);
  const entries = useMemo(() => wire.map(revive), [wire]);
  const now = useMemo(() => new Date(), []);
  const grid = useMemo(() => buildWeekGrid(entries, weekStart, now), [entries, weekStart, now]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const fmtDay = (d: Date) => d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "numeric" });
  const range = `${weekStart.toLocaleDateString(locale)} – ${addDays(weekStart, 6).toLocaleDateString(locale)}`;

  const href = (start: Date, user: string) => {
    const p = new URLSearchParams({ week: dayKey(start) });
    if (user) p.set("user", user);
    return `/time?${p.toString()}`;
  };

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  // Per-day detail lists (chronological)
  const byDay = useMemo(() => {
    const map = new Map<string, (TimesheetEntry & TimeEntryWire)[]>();
    for (const e of entries) {
      const k = dayKey(e.startedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label={t("timesheet.prevWeek")}>
          <Link href={href(addDays(weekStart, -7), isAdmin ? userId : "")}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href(new Date(), isAdmin ? userId : "")}>{t("timesheet.thisWeek")}</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={t("timesheet.nextWeek")}>
          <Link href={href(addDays(weekStart, 7), isAdmin ? userId : "")}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <span className="text-sm font-medium text-muted-foreground">{range}</span>

        {isAdmin && users.length > 0 && (
          <select
            value={userId}
            onChange={(e) => router.push(href(weekStart, e.target.value))}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label={t("timesheet.user")}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}

        <div className="ms-auto">
          <ExportButtons targetId="timesheet-print" filename={`timesheet-${dayKey(weekStart)}`} />
        </div>
      </div>

      {/* Printable timesheet (also the PDF for invoicing) */}
      <div id="timesheet-print" className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t("timesheet.printTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {userName} · {tenantName} · {range}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700">
              {t("time.billable")}: {formatHoursMinutes(grid.billable)} h
            </span>
            <span className="rounded-full bg-secondary px-3 py-1 font-medium text-muted-foreground">
              {t("time.nonBillable")}: {formatHoursMinutes(grid.nonBillable)} h
            </span>
            <span className="rounded-full bg-indigo-500/10 px-3 py-1 font-semibold text-indigo-700">
              {t("time.total")}: {formatHoursMinutes(grid.total)} h
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pe-3 text-start font-medium">{t("timesheet.task")}</th>
                {days.map((d, i) => (
                  <th
                    key={i}
                    className={cn("px-2 py-2 text-center font-medium", dayKey(d) === dayKey(now) && "text-indigo-600")}
                  >
                    {fmtDay(d)}
                  </th>
                ))}
                <th className="ps-2 py-2 text-end font-medium">{t("time.total")}</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    {t("time.noEntries")}
                  </td>
                </tr>
              )}
              {grid.rows.map((row) => (
                <tr key={row.taskId} className="border-b last:border-0">
                  <td className="max-w-56 py-2 pe-3">
                    <Link href={`/tasks/${row.taskId}`} className="block truncate font-medium hover:underline">
                      {row.taskTitle}
                    </Link>
                    {row.projectName && <span className="text-xs text-muted-foreground">{row.projectName}</span>}
                  </td>
                  {row.cells.map((min, i) => (
                    <td key={i} className="px-2 py-2 text-center tabular-nums">
                      {min ? formatMinutes(min) : <span className="text-muted-foreground/40">–</span>}
                    </td>
                  ))}
                  <td className="ps-2 py-2 text-end font-semibold tabular-nums">{formatMinutes(row.total)}</td>
                </tr>
              ))}
            </tbody>
            {grid.rows.length > 0 && (
              <tfoot>
                <tr className="border-t">
                  <td className="py-2 pe-3 font-semibold">{t("time.total")}</td>
                  {grid.dayTotals.map((min, i) => (
                    <td key={i} className="px-2 py-2 text-center font-semibold tabular-nums">
                      {min ? formatMinutes(min) : ""}
                    </td>
                  ))}
                  <td className="ps-2 py-2 text-end font-bold tabular-nums">{formatMinutes(grid.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Day-by-day entries with billable toggle */}
      <div className="space-y-4">
        {days.map((d) => {
          const list = byDay.get(dayKey(d));
          if (!list?.length) return null;
          return (
            <div key={dayKey(d)} className="rounded-2xl border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">
                {d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <ul className="divide-y text-sm">
                {list.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {e.startedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      {e.endedAt && <> – {e.endedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</>}
                    </span>
                    <Link href={`/tasks/${e.taskId}`} className="truncate font-medium hover:underline">
                      {e.taskTitle}
                    </Link>
                    {e.source === "pomodoro" && <span title={t("pomodoro.title")}>🍅</span>}
                    {e.note && <span className="truncate text-muted-foreground">· {e.note}</span>}
                    <span className="ms-auto tabular-nums font-medium text-indigo-600">
                      {e.endedAt ? formatMinutes(entryMinutes(e, now)) : t("time.running")}
                    </span>
                    <button
                      onClick={() => act(() => toggleBillableAction(e.id))}
                      disabled={pending}
                      title={e.billable ? t("time.billable") : t("time.nonBillable")}
                      aria-label={t("time.toggleBillable")}
                      className={cn(
                        "rounded-full p-1 transition-colors",
                        e.billable ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                    >
                      <BadgeEuro className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => act(() => deleteTimeEntryAction(e.id))}
                      disabled={pending}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label={t("time.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
