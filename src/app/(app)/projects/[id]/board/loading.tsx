import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  BackLinkSkeleton,
  PageTitleSkeleton,
  Skeleton,
  KanbanBoardSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Projekt-Kanban — eigener Skeleton, damit nicht
// projects/[id]/loading.tsx (Kartenraster) für das Board greift.
export default function ProjectBoardLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <BackLinkSkeleton />
      <div className="mb-5 flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <PageTitleSkeleton className="w-56" />
      </div>
      <KanbanBoardSkeleton />
    </SkeletonScreen>
  );
}
