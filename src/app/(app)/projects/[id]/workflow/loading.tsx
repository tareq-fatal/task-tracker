import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  BackLinkSkeleton,
  PageTitleSkeleton,
  Skeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Workflow-Editor wie workflow/page.tsx —
// Kopf + Spalten-Zeilen.
export default function WorkflowLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container max-w-3xl py-6">
      <BackLinkSkeleton />
      <PageTitleSkeleton className="w-44" />
      <Skeleton className="mb-6 mt-2 h-3.5 w-72 max-w-full" />
      <div aria-hidden="true" className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </SkeletonScreen>
  );
}
