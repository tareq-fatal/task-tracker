import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  PageTitleSkeleton,
  KpiTilesSkeleton,
  SectionTitleSkeleton,
  CardGridSkeleton,
  Skeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Dashboard-Skeleton — same container, header,
// KPI tiles and TaskCard grid as page.tsx. Also the fallback for (app) routes
// without their own loading.tsx, so it stays generic (title + tiles + cards).
export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <PageTitleSkeleton />
        <Skeleton className="hidden h-10 w-32 sm:block" />
      </div>
      <div className="mb-8">
        <KpiTilesSkeleton count={4} />
      </div>
      <section className="mb-8">
        <SectionTitleSkeleton />
        <CardGridSkeleton count={8} />
      </section>
    </SkeletonScreen>
  );
}
