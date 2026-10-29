import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  PageTitleSkeleton,
  Skeleton,
  CardGridSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Fokus-Liste wie tasks/page.tsx — Titel,
// FocusTabs (Segment-Leiste), gespeicherte Ansichten, Kartenraster 1/2/3.
export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <PageTitleSkeleton className="mb-4 w-44" />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {["w-16", "w-14", "w-16", "w-20"].map((w, i) => (
            <Skeleton key={i} className={`h-8 ${w}`} />
          ))}
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-[1.875rem] w-28 rounded-full" />
      </div>
      <CardGridSkeleton count={9} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" />
    </SkeletonScreen>
  );
}
