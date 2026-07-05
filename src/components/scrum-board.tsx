"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Pencil } from "lucide-react";
import {
  SCRUM_COLUMNS,
  columnOf,
  stickyRotation,
  STICKY_COLOR,
  isOverWip,
  WIP_LIMIT,
  type ScrumColumn,
} from "@/lib/scrum";
import { setTaskScrumColumnAction } from "@/actions/scrum";
import { FreehandCanvas } from "@/components/freehand-canvas";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { TaskType } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

export type ScrumTask = {
  id: string;
  title: string;
  type: string;
  status: string;
  scrumColumn: string | null;
  storyPoints: number | null;
  code: string;
  assignee: string | null;
};

function Avatar({ name, className }: { name: string; className?: string }) {
  const init = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={cn("grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-[10px] font-bold text-white ring-2 ring-white", className)} title={name}>
      {init}
    </span>
  );
}

function Sticky({ task }: { task: ScrumTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: `rotate(${stickyRotation(task.id)}deg)` }}
      className={cn(
        "cursor-grab select-none rounded-lg border p-2.5 shadow-md transition-shadow hover:shadow-lg active:cursor-grabbing",
        STICKY_COLOR[task.type as TaskType] ?? STICKY_COLOR.Task,
        task.status === "Done" && "opacity-80",
        isDragging && "opacity-40"
      )}
    >
      <p className="line-clamp-2 text-[13px] font-medium leading-snug" title={task.title}>
        {task.title}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">{task.code}</span>
        <div className="flex items-center gap-1">
          {task.storyPoints != null && (
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{task.storyPoints} P</span>
          )}
          {task.assignee && <Avatar name={task.assignee} />}
        </div>
      </div>
    </div>
  );
}

function Column({ col, tasks, label, emoji }: { col: ScrumColumn; tasks: ScrumTask[]; label: string; emoji: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  const over = isOverWip(col, tasks.length);
  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className={cn("mb-2 flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm font-semibold", over ? "bg-rose-100 text-rose-700" : "bg-secondary")}>
        <span className="flex items-center gap-1.5">{emoji} {label}</span>
        <span className={cn("rounded-full px-1.5 text-xs", over ? "bg-rose-200" : "bg-background/70")}>
          {tasks.length}{WIP_LIMIT[col] ? `/${WIP_LIMIT[col]}` : ""}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("flex min-h-[60vh] flex-col gap-3 rounded-xl border border-dashed p-2 transition-colors", isOver && "bg-indigo-50 ring-2 ring-indigo-300")}
      >
        {tasks.map((t) => (
          <Link key={t.id} href={`/tasks/${t.id}`} onClick={(e) => e.defaultPrevented && e.preventDefault()}>
            <Sticky task={t} />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ScrumBoard({
  tasks: initial,
  sprint,
  team,
  meName,
}: {
  tasks: ScrumTask[];
  sprint: { name: string; range: string; goal: string | null } | null;
  team: string[];
  meName: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [draw, setDraw] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byCol = useMemo(() => {
    const map = new Map<ScrumColumn, ScrumTask[]>();
    for (const c of SCRUM_COLUMNS) map.set(c.key, []);
    for (const tk of tasks) map.get(columnOf(tk))!.push(tk);
    return map;
  }, [tasks]);

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const col = e.over?.id ? String(e.over.id) : null;
    if (!col) return;
    const task = tasks.find((x) => x.id === id);
    if (!task || columnOf(task) === col) return;
    setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, scrumColumn: col } : x)));
    setTaskScrumColumnAction(id, col).then((r) => { if (!r.ok) router.refresh(); });
  }

  return (
    <div className="relative">
      {/* Header bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-gradient-to-r from-indigo-50 to-pink-50 p-3">
        <div className="min-w-0">
          <div className="font-bold">{sprint ? sprint.name : t("scrum.sprintNone")}</div>
          {sprint && <div className="text-xs text-muted-foreground">{sprint.range}{sprint.goal ? ` · 🎯 ${sprint.goal}` : ""}</div>}
        </div>
        <div className="ms-auto flex items-center gap-3">
          {/* presence (foundation for realtime) */}
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> {meName} · {t("scrum.live")}
          </span>
          <div className="flex -space-x-2 rtl:space-x-reverse">
            {team.slice(0, 6).map((n, i) => <Avatar key={i} name={n} />)}
            {team.length > 6 && <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] ring-2 ring-white">+{team.length - 6}</span>}
          </div>
          <button onClick={() => setDraw((d) => !d)} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", draw && "bg-indigo-100 text-indigo-700")}>
            <Pencil className="h-3.5 w-3.5" /> {t("scrum.draw")}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="board-scroll flex gap-3 overflow-x-auto pb-3">
          {SCRUM_COLUMNS.map((c) => (
            <Column key={c.key} col={c.key} emoji={c.emoji} label={t(`scrum.col.${c.key}` as TKey)} tasks={byCol.get(c.key) ?? []} />
          ))}
        </div>
      </DndContext>

      {draw && <FreehandCanvas onClose={() => setDraw(false)} />}
    </div>
  );
}
