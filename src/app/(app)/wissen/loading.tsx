import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { SkeletonScreen, PageTitleSkeleton, Skeleton, SkeletonText } from "@/components/skeleton";

// TOF-0839: Projekt-Wissen — wie TOF-0789 (Skeleton statt Spinner):
// Kopf, Editor-Card + Seitenspalte (16rem) mit Versionen.
export default function WissenLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container space-y-6 py-6">
      <div>
        <Skeleton className="mb-2 h-5 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <PageTitleSkeleton className="w-40" />
        </div>
        <Skeleton className="mt-1.5 h-3.5 w-80 max-w-full" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <Skeleton className="h-80 w-full" />
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <Skeleton className="mb-3 h-4 w-24" />
          <SkeletonText lines={4} />
        </div>
      </div>
    </SkeletonScreen>
  );
}
