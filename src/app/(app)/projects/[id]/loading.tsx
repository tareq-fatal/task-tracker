import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  BackLinkSkeleton,
  PageTitleSkeleton,
  Skeleton,
  FilterBarSkeleton,
  CardGridSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Projektseite wie projects/[id]/page.tsx —
// Zurück-Link, Kopf (Punkt, Name, Beschreibung) + Button-Gruppe, FilterBar,
// TaskCard-Raster. Board/Leads/Kontext/Workflow haben eigene loading.tsx.
export default function ProjectLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <BackLinkSkeleton />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <PageTitleSkeleton className="w-52" />
          </div>
          <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["w-24", "w-24", "w-32", "w-32"].map((w, i) => (
            <Skeleton key={i} className={`h-10 ${w}`} />
          ))}
        </div>
      </div>
      <FilterBarSkeleton />
      <CardGridSkeleton count={8} />
    </SkeletonScreen>
  );
}
