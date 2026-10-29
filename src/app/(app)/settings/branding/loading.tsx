import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { Skeleton, SkeletonScreen } from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): gemeinsamer role="status"-Wrapper + Shimmer.

export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container max-w-3xl py-6">
      <Skeleton className="mb-1 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </SkeletonScreen>
  );
}
