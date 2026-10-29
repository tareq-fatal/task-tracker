import { cn } from "@/lib/utils";

/*
  TOF-0789 (Tarek 29.10.2026): Skeleton Screens statt Spinner/leerer Flächen.
  Every placeholder mirrors the real markup (same container, paddings, grid,
  fixed heights) so swapping in the real content causes no layout jump.
  - `.tt-skeleton` (globals.css) = soft shimmer, mirrored under [dir="rtl"],
    static under prefers-reduced-motion.
  - Placeholders are aria-hidden; each loading view wraps them ONCE in
    <SkeletonScreen> (role="status" + aria-busy + sr-only label).
  No hooks and no client directive: usable from server loading.tsx AND client views.
*/

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("tt-skeleton rounded-md", className)}
      style={style}
    />
  );
}

/** The one accessible wrapper per loading view (screen readers hear `label`). */
export function SkeletonScreen({
  label,
  className,
  children,
  as: Tag = "div",
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li";
}) {
  return (
    <Tag role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </Tag>
  );
}

/** Text lines (h-3); the last line is shorter like a real paragraph end. */
export function SkeletonText({
  lines = 2,
  className,
  lineClassName = "h-3",
  lastWidth = "w-2/3",
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
  lastWidth?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(lineClassName, i === lines - 1 && lines > 1 ? lastWidth : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-8 shrink-0 rounded-full", className)} />;
}

/** Badge/chip: text-xs + py-0.5 + border = 22px like StatusBadge/PriorityBadge. */
export function SkeletonChip({ className }: { className?: string }) {
  return <Skeleton className={cn("h-[1.375rem] w-16 rounded-full", className)} />;
}

/** "← Zurück" link above a page title (text-sm line + mb-4). */
export function BackLinkSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("mb-4 h-5 w-28", className)} />;
}

/** h1 text-2xl (2rem line height). */
export function PageTitleSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-48", className)} />;
}

/** Section heading: text-sm uppercase (1.25rem line) + mb-3. */
export function SectionTitleSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("mb-3 h-5 w-36", className)} />;
}

/** Mirrors <TaskCard>: border-s-4 accent, title, badge row, time row, footer. */
export function TaskCardSkeleton({
  project = false,
  titleLines = 1,
  bar = false,
}: {
  project?: boolean;
  titleLines?: 1 | 2;
  bar?: boolean;
}) {
  return (
    <div aria-hidden="true" className="rounded-xl border border-s-4 bg-card p-4 shadow-sm">
      {project && (
        <div className="mb-2 flex h-4 items-center gap-1.5">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}
      <div className="mb-3 flex items-start gap-2">
        <Skeleton className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5 py-0.5">
          <Skeleton className={cn("h-3.5", titleLines === 2 ? "w-full" : "w-4/5")} />
          {titleLines === 2 && <Skeleton className="h-3.5 w-1/2" />}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <SkeletonChip className="w-14" />
        <SkeletonChip className="w-20" />
      </div>
      {bar && (
        <div className="mb-3 space-y-1">
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex h-4 items-center justify-between">
            <Skeleton className="h-2.5 w-6" />
            <Skeleton className="h-2.5 w-8" />
          </div>
        </div>
      )}
      <div className="mb-3 flex h-4 items-center">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-10" />
        <SkeletonAvatar className="h-6 w-6" />
      </div>
    </div>
  );
}

/** Deterministic variety so a grid doesn't look like wallpaper. */
const CARD_SHAPES: { project: boolean; titleLines: 1 | 2; bar: boolean }[] = [
  { project: true, titleLines: 2, bar: false },
  { project: false, titleLines: 1, bar: true },
  { project: true, titleLines: 1, bar: false },
  { project: false, titleLines: 2, bar: false },
];

/** Grid of TaskCard skeletons (dashboard / project page / focus lists). */
export function CardGridSkeleton({
  count = 8,
  className = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} {...CARD_SHAPES[i % CARD_SHAPES.length]} />
      ))}
    </div>
  );
}

/** Mirrors <KpiCards>: Card p-4, value (text-2xl) + label (text-xs, mt-1). */
export function KpiTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 shadow-sm">
          <Skeleton className="my-1 h-6 w-12" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors <FilterBar> first row: search input (h-10), inline selects (md+),
 *  mobile filter button, result counter. */
export function FilterBarSkeleton() {
  return (
    <div aria-hidden="true" className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 min-w-[10rem] flex-1 sm:max-w-xs" />
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {["w-28", "w-24", "w-24", "w-20", "w-24"].map((w, i) => (
            <Skeleton key={i} className={cn("h-9", w)} />
          ))}
        </div>
        <Skeleton className="h-9 w-24 md:hidden" />
        <Skeleton className="ms-auto h-4 w-20" />
      </div>
    </div>
  );
}

/** One Kanban column, same width/snap/min-height as kanban-board.tsx Column. */
export function KanbanColumnSkeleton({
  cards,
  dotClass,
}: {
  cards: { project: boolean; titleLines: 1 | 2; bar: boolean }[];
  dotClass?: string;
}) {
  return (
    <div aria-hidden="true" className="board-col flex w-[82vw] shrink-0 flex-col xs:w-[70vw] sm:w-80">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex h-5 items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full opacity-50", dotClass)} />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <Skeleton className="h-5 w-7 rounded-full" />
      </div>
      <div className="flex min-h-[62vh] flex-col gap-2.5 rounded-2xl border border-dashed bg-muted/30 p-2.5">
        {cards.map((c, i) => (
          <TaskCardSkeleton key={i} {...c} />
        ))}
      </div>
    </div>
  );
}

const BOARD_COLUMNS = [
  { dotClass: "bg-indigo-500", cards: [CARD_SHAPES[0], CARD_SHAPES[1], CARD_SHAPES[2]] },
  { dotClass: "bg-amber-500", cards: [CARD_SHAPES[3], CARD_SHAPES[2]] },
  { dotClass: "bg-emerald-500", cards: [CARD_SHAPES[1], CARD_SHAPES[3], CARD_SHAPES[0], CARD_SHAPES[2]] },
];

/** Whole board: mobile column dots + horizontally scrolling columns. */
export function KanbanBoardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-3 flex items-center justify-center gap-2 sm:hidden">
        <span className="h-2 w-6 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="board-scroll flex gap-4 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col, i) => (
          <KanbanColumnSkeleton key={i} {...col} />
        ))}
      </div>
    </div>
  );
}

/** Table placeholder with the real table's wrapper/head/cell classes.
 *  `columns` = skeleton widths per column (one entry per <th>). */
export function TableRowsSkeleton({
  columns,
  rows = 6,
  className = "overflow-x-auto rounded-xl border",
  headClassName = "bg-muted/50",
  headCellClassName = "px-3 py-2 text-start",
  cellClassName = "px-3 py-3",
  tableClassName = "w-full text-sm",
}: {
  columns: string[];
  rows?: number;
  className?: string;
  headClassName?: string;
  headCellClassName?: string;
  cellClassName?: string;
  tableClassName?: string;
}) {
  return (
    <div aria-hidden="true" className={className}>
      <table className={tableClassName}>
        <thead className={headClassName}>
          <tr>
            {columns.map((w, i) => (
              <th key={i} className={headCellClassName}>
                <Skeleton className={cn("h-4", w)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-t">
              {columns.map((w, c) => (
                <td key={c} className={cellClassName}>
                  {/* alternate widths a little so rows don't look cloned */}
                  <Skeleton className={cn("h-4", (r + c) % 3 === 1 ? "w-3/4" : w)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Generic row list (search results, notifications, comments, pickers). */
export function SkeletonRows({
  rows = 3,
  avatar = true,
  avatarClassName,
  lines = 2,
  className,
  rowClassName = "flex items-start gap-3 px-3 py-3",
}: {
  rows?: number;
  avatar?: boolean;
  avatarClassName?: string;
  lines?: 1 | 2;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div aria-hidden="true" className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={rowClassName}>
          {avatar && <SkeletonAvatar className={avatarClassName} />}
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <Skeleton className={cn("h-3.5", i % 2 ? "w-1/2" : "w-2/3")} />
            {lines === 2 && <Skeleton className="h-3 w-5/6" />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Label + input pairs (task form, settings forms). */
export function FormFieldsSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div aria-hidden="true" className="space-y-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className={cn("w-full", i === 1 ? "h-24" : "h-10")} />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}
