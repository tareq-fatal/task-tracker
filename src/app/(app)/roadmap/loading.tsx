import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { Skeleton, SkeletonScreen } from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): gemeinsamer role="status"-Wrapper + Shimmer.

export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <Skeleton className="mb-1 h-8 w-40" />
      <Skeleton className="mb-6 h-4 w-56" />
      <div className="space-y-2 rounded-xl border p-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    </SkeletonScreen>
  );
}
