"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, ZoomIn } from "lucide-react";
import {
  PX_PER_DAY,
  DAY_MS,
  ZOOM_LEVELS,
  type ZoomLevel,
  resolveSchedule,
  ganttWindow,
  xForMs,
  barGeometry,
  axisTicks,
  criticalPath,
  addDays,
  diffDays,
  startOfDay,
} from "@/lib/gantt";
import { setTaskScheduleAction } from "@/actions/tasks";
import { ExportButtons } from "@/components/infographic-export";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ZOOM_KEY: Record<ZoomLevel, TKey> = {
  day: "gantt.zoom.day",
  week: "gantt.zoom.week",
  month: "gantt.zoom.month",
};

export type GanttTask = {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  estimatedHours: number | null;
  color: string | null; // project colour
  assignee: string | null;
  canEdit: boolean;
};
export type GanttDep = { taskId: string; dependsOnId: string };

const TYPE_FILL: Record<string, string> = {
  Epic: "#8b5cf6",
  Story: "#10b981",
  Task: "#6366f1",
  Subtask: "#94a3b8",
  Bug: "#f43f5e",
};

const ROW_H = 40;
const HEADER_H = 34;
const BAR_H = 22;
const LABEL_W = 240;
const DRAG_THRESHOLD = 4;

const iso10 = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short" });

type Sched = { start: number; end: number };
type DragState = {
  id: string;
  mode: "move" | "l" | "r";
  startClientX: number;
  orig: Sched;
  moved: boolean;
};

export function GanttBoard({
  tasks,
  deps,
  initialZoom = "week",
}: {
  tasks: GanttTask[];
  deps: GanttDep[];
  initialZoom?: ZoomLevel;
}) {
  const { t } = useT();
  const router = useRouter();
  const [zoom, setZoom] = useState<ZoomLevel>(initialZoom);
  const [showCritical, setShowCritical] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Resolved schedules, kept in state so drags update optimistically.
  const [sched, setSched] = useState<Record<string, Sched>>(() => {
    const m: Record<string, Sched> = {};
    for (const tk of tasks) m[tk.id] = resolveSchedule(tk);
    return m;
  });
  // Re-seed if the task set changes (e.g. after a server revalidation).
  useEffect(() => {
    setSched((prev) => {
      const m: Record<string, Sched> = {};
      for (const tk of tasks) m[tk.id] = prev[tk.id] ?? resolveSchedule(tk);
      return m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.map((x) => `${x.id}:${x.startDate}:${x.dueDate}`).join("|")]);

  const ppd = PX_PER_DAY[zoom];
  const now = Date.now();

  const schedules = useMemo(() => tasks.map((tk) => sched[tk.id]).filter(Boolean), [tasks, sched]);
  const { from, to } = useMemo(() => ganttWindow(schedules, now, 3), [schedules, now]);
  const ticks = useMemo(() => axisTicks(from, to, zoom, ppd), [from, to, zoom, ppd]);
  const trackW = Math.max(diffDays(from, to), 1) * ppd;

  const cpm = useMemo(
    () =>
      criticalPath(
        tasks.map((tk) => ({ id: tk.id, start: sched[tk.id]?.start ?? 0, end: sched[tk.id]?.end ?? 0 })),
        deps
      ),
    [tasks, sched, deps]
  );

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    tasks.forEach((tk, i) => m.set(tk.id, i));
    return m;
  }, [tasks]);

  // ── Drag handling ────────────────────────────────────────────────────────
  // Latest sched snapshot for the pointerup handler (avoids stale closure).
  const schedRef = useRef(sched);
  schedRef.current = sched;

  const persist = useCallback(async (id: string, s: Sched) => {
    const res = await setTaskScheduleAction(id, iso10(s.start), iso10(s.end));
    if (!res.ok) router.refresh(); // reject (e.g. lost permission) → resync from server
  }, [router]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const deltaDays = Math.round((e.clientX - drag.startClientX) / ppd);
      if (Math.abs(e.clientX - drag.startClientX) > DRAG_THRESHOLD && !drag.moved) {
        setDrag((d) => (d ? { ...d, moved: true } : d));
      }
      setSched((prev) => {
        const next = { ...prev };
        const { start, end } = drag.orig;
        if (drag.mode === "move") {
          next[drag.id] = { start: addDays(start, deltaDays), end: addDays(end, deltaDays) };
        } else if (drag.mode === "l") {
          const ns = Math.min(addDays(start, deltaDays), end - DAY_MS);
          next[drag.id] = { start: ns, end };
        } else {
          const ne = Math.max(addDays(end, deltaDays), start + DAY_MS);
          next[drag.id] = { start, end: ne };
        }
        return next;
      });
    };
    const onUp = () => {
      setDrag((d) => {
        if (d) {
          const finalSched = schedRef.current[d.id];
          if (d.moved && finalSched && (finalSched.start !== d.orig.start || finalSched.end !== d.orig.end)) {
            persist(d.id, finalSched);
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, ppd, persist]);

  function startDrag(e: React.PointerEvent, id: string, mode: DragState["mode"], canEdit: boolean) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ id, mode, startClientX: e.clientX, orig: schedRef.current[id], moved: false });
  }

  const H = tasks.length * ROW_H;

  if (tasks.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("gantt.empty")}</p>;
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label={t("gantt.zoom")}>
          <ZoomIn className="ms-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                zoom === z ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(ZOOM_KEY[z])}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCritical((v) => !v)}
          aria-pressed={showCritical}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            showCritical ? "border-rose-300 bg-rose-50 text-rose-700" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <GitBranch className="h-3.5 w-3.5" />
          {t("gantt.criticalPath")}
        </button>

        {showCritical && cpm.finish > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("gantt.duration")}: <span className="font-semibold text-foreground">{cpm.finish} {t("gantt.days")}</span>
          </span>
        )}

        <div className="ms-auto">
          <ExportButtons targetId="gantt-canvas" filename="gantt-chart" />
        </div>
      </div>

      {/* Chart */}
      <div className="overflow-x-auto" dir="ltr">
        <div id="gantt-canvas" className="flex bg-card" style={{ width: LABEL_W + trackW, minWidth: "100%" }}>
          {/* Frozen label column */}
          <div className="sticky left-0 z-30 shrink-0 border-e bg-card" style={{ width: LABEL_W }}>
            <div className="border-b bg-muted/40" style={{ height: HEADER_H }} />
            {tasks.map((tk) => {
              const crit = showCritical && cpm.critical.has(tk.id);
              return (
                <button
                  key={tk.id}
                  onClick={() => router.push(`/tasks/${tk.id}`)}
                  className="flex w-full items-center gap-2 border-b px-3 text-start hover:bg-muted/40"
                  style={{ height: ROW_H }}
                  title={tk.title}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: tk.color ?? TYPE_FILL[tk.type] ?? "#6366f1" }}
                  />
                  <span className={cn("truncate text-sm", tk.status === "Done" && "text-muted-foreground line-through")}>
                    {tk.title}
                  </span>
                  {crit && <span className="ms-auto text-[10px] font-bold text-rose-500" title={t("gantt.criticalPath")}>▲</span>}
                </button>
              );
            })}
          </div>

          {/* Timeline track */}
          <div className="relative" style={{ width: trackW, height: HEADER_H + H }}>
            {/* Axis header */}
            <div className="absolute left-0 top-0 border-b bg-muted/40" style={{ width: trackW, height: HEADER_H }}>
              {ticks.map((tk, i) => (
                <div key={i} className="absolute top-0 flex h-full flex-col justify-center" style={{ left: tk.x }}>
                  <span
                    className={cn(
                      "whitespace-nowrap border-s ps-1 text-[10px] leading-tight",
                      tk.major ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {tk.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Gridlines */}
            {ticks.map((tk, i) => (
              <div
                key={i}
                className={cn("absolute w-px", tk.major ? "bg-border" : "bg-border/40")}
                style={{ left: tk.x, top: HEADER_H, height: H }}
              />
            ))}

            {/* Today marker */}
            {now >= from && now <= to && (
              <div
                className="absolute z-20 w-0.5 bg-rose-500/70"
                style={{ left: xForMs(startOfDay(now), from, ppd), top: HEADER_H - 6, height: H + 6 }}
                title={t("gantt.today")}
              >
                <span className="absolute -top-0 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">•</span>
              </div>
            )}

            {/* Dependency arrows */}
            <svg
              className="pointer-events-none absolute z-10"
              style={{ left: 0, top: HEADER_H, width: trackW, height: H }}
              width={trackW}
              height={H}
            >
              <defs>
                <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#f43f5e" />
                </marker>
              </defs>
              {deps.map((d, i) => {
                const a = sched[d.dependsOnId];
                const b = sched[d.taskId];
                const ra = rowIndex.get(d.dependsOnId);
                const rb = rowIndex.get(d.taskId);
                if (!a || !b || ra == null || rb == null) return null;
                const x1 = xForMs(a.end, from, ppd);
                const y1 = ra * ROW_H + ROW_H / 2;
                const x2 = xForMs(b.start, from, ppd);
                const y2 = rb * ROW_H + ROW_H / 2;
                const crit = showCritical && cpm.criticalEdges.has(`${d.dependsOnId}->${d.taskId}`);
                const mid = Math.max(x1 + 12, x2 - 12);
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
                    fill="none"
                    stroke={crit ? "#f43f5e" : "#94a3b8"}
                    strokeWidth={crit ? 2 : 1.3}
                    markerEnd={crit ? "url(#gantt-arrow-crit)" : "url(#gantt-arrow)"}
                  />
                );
              })}
            </svg>

            {/* Bars */}
            {tasks.map((tk) => {
              const s = sched[tk.id];
              if (!s) return null;
              const row = rowIndex.get(tk.id)!;
              const { x, width } = barGeometry(s, from, ppd);
              const crit = showCritical && cpm.critical.has(tk.id);
              const fill = tk.color ?? TYPE_FILL[tk.type] ?? "#6366f1";
              const isDragging = drag?.id === tk.id;
              const dragging = isDragging && drag?.moved;
              return (
                <div
                  key={tk.id}
                  className={cn(
                    "group absolute z-10 flex items-center rounded-md shadow-sm ring-1 ring-black/5 transition-shadow",
                    tk.canEdit ? "cursor-grab" : "cursor-pointer",
                    isDragging && "z-30 cursor-grabbing shadow-lg",
                    crit && "ring-2 ring-rose-500",
                    tk.status === "Done" && "opacity-70"
                  )}
                  style={{
                    left: x,
                    top: HEADER_H + row * ROW_H + (ROW_H - BAR_H) / 2,
                    width: Math.max(width, 8),
                    height: BAR_H,
                    background: `linear-gradient(90deg, ${fill}, ${fill}cc)`,
                  }}
                  onPointerDown={(e) => startDrag(e, tk.id, "move", tk.canEdit)}
                  onClick={() => { if (!dragging) router.push(`/tasks/${tk.id}`); }}
                  title={`${tk.title}\n${fmt(s.start)} → ${fmt(s.end)} · ${diffDays(s.start, s.end)}${t("gantt.days.short")}${tk.assignee ? ` · ${tk.assignee}` : ""}`}
                  role="button"
                  aria-label={`${tk.title}, ${iso10(s.start)} → ${iso10(s.end)}`}
                >
                  {/* progress fill */}
                  {tk.progress > 0 && (
                    <div className="absolute inset-y-0 left-0 rounded-md bg-white/35" style={{ width: `${Math.min(100, tk.progress)}%` }} />
                  )}
                  {/* resize handles */}
                  {tk.canEdit && (
                    <>
                      <span
                        onPointerDown={(e) => startDrag(e, tk.id, "l", true)}
                        className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize rounded-l-md bg-black/0 hover:bg-black/20"
                        aria-hidden
                      />
                      <span
                        onPointerDown={(e) => startDrag(e, tk.id, "r", true)}
                        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize rounded-r-md bg-black/0 hover:bg-black/20"
                        aria-hidden
                      />
                    </>
                  )}
                  <span className="pointer-events-none relative z-[1] truncate px-2 text-[11px] font-medium text-white drop-shadow-sm">
                    {width > 44 ? tk.title : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t p-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-rose-500" /> {t("gantt.legend.critical")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-0.5 bg-rose-500/70" /> {t("gantt.today")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-white/35 ring-1 ring-border" /> {t("gantt.legend.progress")}</span>
        <span className="ms-auto">{t("gantt.hint")}</span>
      </div>
    </div>
  );
}
