"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthMatrix } from "@/lib/views";
import { setTaskDueDateAction } from "@/actions/tasks";
import { useT } from "@/components/i18n-provider";
import { formatMonthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ViewTask = {
  id: string;
  title: string;
  status: string;
  type: string;
  dueDate: string | null; // yyyy-mm-dd
};

const TYPE_DOT: Record<string, string> = {
  Epic: "bg-violet-500",
  Story: "bg-emerald-500",
  Task: "bg-indigo-500",
  Subtask: "bg-slate-400",
  Bug: "bg-rose-500",
};

function Chip({ task }: { task: ViewTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab items-center gap-1 truncate rounded-md bg-card px-1.5 py-0.5 text-[11px] shadow-sm ring-1 ring-border",
        task.status === "Done" && "line-through opacity-60",
        isDragging && "opacity-40"
      )}
      title={task.title}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TYPE_DOT[task.type] ?? "bg-indigo-500")} />
      <span className="truncate">{task.title}</span>
    </div>
  );
}

function DayCell({ date, day, inMonth, tasks, onCreate }: {
  date: string; day: number; inMonth: boolean; tasks: ViewTask[]; onCreate: (d: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const today = new Date().toISOString().slice(0, 10) === date;
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => { if (e.target === e.currentTarget) onCreate(date); }}
      className={cn(
        "min-h-[92px] border p-1 transition-colors",
        !inMonth && "bg-muted/40 text-muted-foreground",
        isOver && "bg-indigo-50 ring-2 ring-indigo-300",
        "hover:bg-secondary/40"
      )}
    >
      <div className={cn("mb-1 text-right text-[11px]", today && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white")}>
        {day}
      </div>
      <div className="space-y-1">
        {tasks.map((t) => (
          <Chip key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}

export function CalendarView({ tasks: initial }: { tasks: ViewTask[] }) {
  const { t, locale } = useT();
  const router = useRouter();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getUTCFullYear(), m: now.getUTCMonth() });
  const [tasks, setTasks] = useState(initial);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const weeks = useMemo(() => monthMatrix(ym.y, ym.m), [ym]);
  const byDay = useMemo(() => {
    const map = new Map<string, ViewTask[]>();
    for (const tk of tasks) if (tk.dueDate) map.set(tk.dueDate, [...(map.get(tk.dueDate) ?? []), tk]);
    return map;
  }, [tasks]);

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const date = e.over?.id ? String(e.over.id) : null;
    if (!date) return;
    const task = tasks.find((x) => x.id === id);
    if (!task || task.dueDate === date) return;
    setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, dueDate: date } : x)));
    setTaskDueDateAction(id, date);
  }

  const monthLabel = formatMonthYear(new Date(ym.y, ym.m, 1), locale);
  const dows = [t("cal.mon"), t("cal.tue"), t("cal.wed"), t("cal.thu"), t("cal.fri"), t("cal.sat"), t("cal.sun")];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button aria-label={t("cal.prevMonth")} onClick={() => setYm((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: (p.m + 11) % 12 }))} className="rounded-md border p-1.5 hover:bg-muted">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <span className="min-w-44 text-center font-semibold">{monthLabel}</span>
        <button aria-label={t("cal.nextMonth")} onClick={() => setYm((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: (p.m + 1) % 12 }))} className="rounded-md border p-1.5 hover:bg-muted">
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
        <button onClick={() => setYm({ y: now.getUTCFullYear(), m: now.getUTCMonth() })} className="ms-2 rounded-md border px-2 py-1 text-xs hover:bg-muted">
          {t("cal.today")}
        </button>
        <span className="ms-auto text-xs text-muted-foreground">{t("cal.hint")}</span>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-xs">
        {dows.map((d) => (
          <div key={d} className="border-b bg-muted/50 p-1.5 text-center font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-7 overflow-hidden rounded-b-lg border-x border-b">
          {weeks.flat().map((c) => (
            <DayCell key={c.date} date={c.date} day={c.day} inMonth={c.inMonth} tasks={byDay.get(c.date) ?? []} onCreate={(d) => router.push(`/tasks/new?due=${d}`)} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
