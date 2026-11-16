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
import { statusGateMessageKey } from "@/lib/status-gate-messages";
import { TaskCard, type TaskCardData } from "@/components/task-card";
import { FeatureHint } from "@/components/onboarding/feature-hint";
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
  Todo: "bg-slate-400",
  InProgress: "bg-sky-500",
  Done: "bg-emerald-500",
  Archived: "bg-slate-400",
};

// TOF-0962 Tempo: je Spalte zuerst nur so viele Karten rendern, Rest auf Klick.
const PAGE = 40;

function Column({
  status,
  tasks,
  label,
  innerRef,
  totalCount,
  footer,
}: {
  status: TaskStatus;
  tasks: BoardTask[];
  label: string;
  innerRef: (el: HTMLDivElement | null) => void;
  /** Gesamtzahl laut Server (z. B. alle Erledigten), wenn nicht alle geladen sind. */
  totalCount?: number;
  footer?: React.ReactNode;
}) {
  const { t } = useT();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [limit, setLimit] = useState(PAGE);
  const shown = tasks.slice(0, limit);
  const rest = tasks.length - shown.length;

  return (
    <section
      ref={innerRef}
      aria-label={label}
      className="board-col flex w-[86vw] shrink-0 flex-col xs:w-[72vw] sm:w-[320px]"
    >
      <header className="mb-2 flex h-9 items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", COLUMN_TINT[status])} aria-hidden />
          <h2 className="text-sm font-semibold">{label}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{totalCount ?? tasks.length}</span>
        </div>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[60vh] flex-col gap-2 rounded-xl p-1.5 transition-colors duration-150",
          isOver ? "bg-primary-soft ring-2 ring-primary/40" : "bg-secondary/60 dark:bg-secondary/40"
        )}
      >
        {shown.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="h-10 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground coarse:h-11"
          >
            {t("board.showMore" as TKey, { n: Math.min(rest, PAGE) })}
          </button>
        )}
        {footer}
        {tasks.length === 0 && (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-center text-xs text-muted-foreground transition-colors",
              isOver && "border-primary/50 text-primary"
            )}
          >
            {isOver ? "⤵" : "—"}
          </div>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({
  initialTasks,
  doneTotal,
}: {
  initialTasks: BoardTask[];
  /** TOF-0962: Server lädt nur die letzten Erledigten; hier die Gesamtzahl. */
  doneTotal?: number;
}) {
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
      // Workflow-Gates (2026-08-04): jede Ablehnung bekommt einen Grund —
      // vorher revertete ein unbekannter Fehler stumm.
      toast(t(statusGateMessageKey(res.error)), "error");
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
      {/* First-use coach-mark, anchored to the top-start of the board. */}
      <div className="relative">
        <FeatureHint
          id="kanban"
          titleKey="onboarding.hint.kanban.title"
          textKey="onboarding.hint.kanban.text"
          placement="bottom"
        />
      </div>

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
              i === activeCol ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="board-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
      >
        {BOARD_STATUSES.map((status, i) => {
          const colTasks = tasks.filter((x) => x.status === status);
          const limitedDone = status === "Done" && doneTotal != null && doneTotal > colTasks.length;
          return (
            <Column
              key={status}
              status={status}
              label={t(`status.${status}` as TKey)}
              tasks={colTasks}
              totalCount={limitedDone ? doneTotal : undefined}
              innerRef={(el) => (colRefs.current[i] = el)}
              footer={
                limitedDone ? (
                  <a
                    href="/list"
                    className="flex h-10 items-center justify-center rounded-lg text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground coarse:h-11"
                  >
                    {t("board.doneRecent" as TKey, { n: colTasks.length })} · {t("board.allDone" as TKey)}
                  </a>
                ) : null
              }
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeTask ? (
          <div className="w-[86vw] rotate-2 cursor-grabbing rounded-xl shadow-overlay xs:w-[72vw] sm:w-[320px]">
            <TaskCard task={activeTask} showStatus={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
