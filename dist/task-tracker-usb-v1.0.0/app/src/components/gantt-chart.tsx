"use client";

import Link from "next/link";
import { barPosition, timeTicks, todayPct } from "@/lib/views";
import { cn } from "@/lib/utils";

export type GanttTask = {
  id: string;
  title: string;
  status: string;
  type: string;
  start: string; // iso
  end: string; // iso
};
export type GanttDep = { taskId: string; dependsOnId: string };

const TYPE_FILL: Record<string, string> = {
  Epic: "#8b5cf6",
  Story: "#10b981",
  Task: "#6366f1",
  Subtask: "#94a3b8",
  Bug: "#f43f5e",
};

export function GanttChart({
  tasks,
  deps = [],
  from,
  to,
  mode = "gantt",
}: {
  tasks: GanttTask[];
  deps?: GanttDep[];
  from: string;
  to: string;
  mode?: "gantt" | "timeline";
}) {
  const f = new Date(from);
  const tt = new Date(to);
  const rowH = mode === "timeline" ? 24 : 34;
  const barH = mode === "timeline" ? 12 : 18;
  const ticks = timeTicks(f, tt, mode === "timeline" ? 9 : 7);
  const today = todayPct(new Date(), f, tt);

  const pos = new Map<string, { left: number; width: number; row: number }>();
  tasks.forEach((task, i) => {
    const p = barPosition(new Date(task.start), new Date(task.end), f, tt);
    if (p) pos.set(task.id, { ...p, row: i });
  });

  const H = tasks.length * rowH;
  const labelW = mode === "timeline" ? 150 : 190;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        {/* tick header */}
        <div className="flex">
          <div style={{ width: labelW }} className="shrink-0" />
          <div className="relative h-5 flex-1">
            {ticks.map((tk) => (
              <span key={tk.pct} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${tk.pct}%` }}>
                {tk.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex">
          {/* labels */}
          <div style={{ width: labelW }} className="shrink-0">
            {tasks.map((task) => (
              <div key={task.id} style={{ height: rowH }} className="flex items-center truncate pe-2 text-xs">
                <Link href={`/tasks/${task.id}`} className="truncate hover:underline" title={task.title}>
                  {task.title}
                </Link>
              </div>
            ))}
          </div>

          {/* track */}
          <div className="relative flex-1 rounded-md border bg-card" style={{ height: H }}>
            {/* vertical gridlines */}
            {ticks.map((tk) => (
              <div key={tk.pct} className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${tk.pct}%` }} />
            ))}
            {/* today line */}
            {today != null && (
              <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-rose-500/70" style={{ left: `${today}%` }} title="today" />
            )}
            {/* dependency arrows */}
            <svg className="pointer-events-none absolute inset-0 z-20" width="100%" height={H} viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none">
              <defs>
                <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                </marker>
              </defs>
              {deps.map((d, i) => {
                const a = pos.get(d.dependsOnId);
                const b = pos.get(d.taskId);
                if (!a || !b) return null;
                const x1 = ((a.left + a.width) / 100) * 1000;
                const y1 = a.row * rowH + rowH / 2;
                const x2 = (b.left / 100) * 1000;
                const y2 = b.row * rowH + rowH / 2;
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} C ${x1 + 30} ${y1}, ${x2 - 30} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.2}
                    markerEnd="url(#gantt-arrow)"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {/* bars */}
            {tasks.map((task, i) => {
              const p = pos.get(task.id);
              if (!p) return null;
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className={cn(
                    "absolute z-10 flex items-center rounded-md px-1.5 text-[10px] font-medium text-white shadow-sm",
                    task.status === "Done" && "opacity-60"
                  )}
                  style={{
                    left: `${p.left}%`,
                    width: `${p.width}%`,
                    top: i * rowH + (rowH - barH) / 2,
                    height: barH,
                    backgroundColor: TYPE_FILL[task.type] ?? "#6366f1",
                  }}
                  title={`${task.title} — ${task.start.slice(0, 10)} → ${task.end.slice(0, 10)}`}
                >
                  {mode === "gantt" && <span className="truncate">{task.title}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
