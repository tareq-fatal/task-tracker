import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { SkeletonScreen, PageTitleSkeleton, Skeleton } from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Projektliste wie projects/page.tsx —
// Kopf mit Button, Raster 1/2/3 aus Card p-5 (Punkt+Name, 2 Zeilen, Zähler).
export default function ProjectsLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <PageTitleSkeleton className="w-40" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} aria-hidden="true" className="h-full rounded-lg border bg-card p-5 shadow-sm">
            <div className="mb-2 flex h-6 items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className={i % 2 ? "h-4 w-28" : "h-4 w-40"} />
            </div>
            <div className="mb-3 space-y-2 py-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
