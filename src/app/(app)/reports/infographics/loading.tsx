import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { Skeleton, SkeletonScreen } from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): gemeinsamer role="status"-Wrapper + Shimmer.

export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <Skeleton className="mb-6 h-8 w-40" />
      <Skeleton className="mb-5 h-10 w-full max-w-md rounded-md" />
      <Skeleton className="mb-5 h-40 w-full rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    </SkeletonScreen>
  );
}
