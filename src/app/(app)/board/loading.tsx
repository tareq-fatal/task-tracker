import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  PageTitleSkeleton,
  FilterBarSkeleton,
  KanbanBoardSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Kanban-Skeleton wie board/page.tsx —
// Titel, FilterBar, Spalten (Breite/Snap/min-h wie kanban-board.tsx).
export default function BoardLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <PageTitleSkeleton className="mb-4 w-40" />
      <FilterBarSkeleton />
      <KanbanBoardSkeleton />
    </SkeletonScreen>
  );
}
