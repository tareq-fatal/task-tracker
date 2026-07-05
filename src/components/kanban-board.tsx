"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { BOARD_STATUSES, type TaskStatus } from "@/lib/enums";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { celebrate } from "@/lib/confetti";
import { updateTaskStatusAction } from "@/actions/tasks";
import { TaskCard, type TaskCardData } from "@/components/task-card";
import type { TKey } from "@/lib/i18n";

type BoardTask = TaskCardData & { status: string };

function DraggableCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
      {...listeners}
      {...attributes}
    >
      <TaskCard task={task} showStatus={false} />
    </div>
  );
}

const COLUMN_TINT: Record<TaskStatus, string> = {
  Todo: "bg-indigo-500",
  InProgress: "bg-amber-500",
  Done: "bg-emerald-500",
  Archived: "bg-slate-400",
};

function Column({
  status,
  tasks,
  label,
  innerRef,
}: {
  status: TaskStatus;
  tasks: BoardTask[];
  label: string;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={innerRef}
      className="board-col flex w-[82vw] shrink-0 flex-col xs:w-[70vw] sm:w-80"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", COLUMN_TINT[status])} />
          <h3 className="text-sm font-semibold">{label}</h3>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[62vh] flex-col gap-2.5 rounded-2xl border bg-muted/30 p-2.5 transition-all duration-200",
          isOver
            ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-300/60"
            : "border-dashed"
        )}
      >
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-xl border border-dashed py-10 text-center text-xs text-muted-foreground transition-colors",
              isOver && "border-indigo-300 text-indigo-600"
            )}
          >
            {isOver ? "⤵" : "—"}
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ initialTasks }: { initialTasks: BoardTask[] }) {
  const { t } = useT();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCol, setActiveCol] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  // keep optimistic state in sync if the server data changes
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press (450ms) to drag on touch; short swipes scroll the board.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 450, tolerance: 8 },
    })
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || !BOARD_STATUSES.includes(overId as any)) return;

    const task = tasks.find((x) => x.id === taskId);
    if (!task || task.status === overId) return;

    const prev = tasks;
    setTasks((ts) =>
      ts.map((x) => (x.id === taskId ? { ...x, status: overId } : x))
    );
    const res = await updateTaskStatusAction(taskId, overId);
    if (!res.ok) {
      setTasks(prev);
      if (res.error === "BLOCKED") toast(t("task.blocked"), "error");
    } else if (overId === "Done") celebrate();
  }

  // Track which column is centered (mobile swipe indicator)
  function onScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const center = container.getBoundingClientRect().left + container.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    colRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActiveCol(best);
  }

  function goToColumn(i: number) {
    colRefs.current[i]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  const activeTask = tasks.find((x) => x.id === activeId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Mobile column indicator / quick-jump dots (above the board) */}
      <div className="mb-3 flex items-center justify-center gap-2 sm:hidden">
        {BOARD_STATUSES.map((status, i) => (
          <button
            key={status}
            type="button"
            aria-label={t(`status.${status}` as TKey)}
            onClick={() => goToColumn(i)}
            className={cn(
              "h-2 rounded-full transition-all duration-200",
              i === activeCol
                ? "w-6 bg-gradient-to-r from-indigo-500 to-pink-500"
                : "w-2 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="board-scroll flex gap-4 overflow-x-auto pb-4"
      >
        {BOARD_STATUSES.map((status, i) => (
          <Column
            key={status}
            status={status}
            label={t(`status.${status}` as TKey)}
            tasks={tasks.filter((x) => x.status === status)}
            innerRef={(el) => (colRefs.current[i] = el)}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeTask ? (
          <div className="w-[82vw] rotate-3 scale-[1.03] cursor-grabbing shadow-2xl xs:w-[70vw] sm:w-80">
            <TaskCard task={activeTask} showStatus={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
