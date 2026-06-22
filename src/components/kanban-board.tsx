"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
      className={cn("touch-none", isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      <TaskCard task={task} showStatus={false} />
    </div>
  );
}

function Column({
  status,
  tasks,
  label,
}: {
  status: TaskStatus;
  tasks: BoardTask[];
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-72 shrink-0 flex-col sm:w-80">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[60vh] flex-col gap-2 rounded-lg border border-dashed bg-muted/40 p-2 transition-colors",
          isOver && "border-primary bg-primary/5"
        )}
      >
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            —
          </p>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ initialTasks }: { initialTasks: BoardTask[] }) {
  const { t } = useT();
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    })
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    if (!BOARD_STATUSES.includes(overId as any)) return;

    const task = tasks.find((x) => x.id === taskId);
    if (!task || task.status === overId) return;

    const prev = tasks;
    setTasks((ts) =>
      ts.map((x) => (x.id === taskId ? { ...x, status: overId } : x))
    );

    const res = await updateTaskStatusAction(taskId, overId);
    if (!res.ok) setTasks(prev); // revert on failure
  }

  const activeTask = tasks.find((x) => x.id === activeId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="board-scroll flex gap-4 overflow-x-auto pb-4">
        {BOARD_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            label={t(`status.${status}` as TKey)}
            tasks={tasks.filter((x) => x.status === status)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="w-72 rotate-2 sm:w-80">
            <TaskCard task={activeTask} showStatus={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
