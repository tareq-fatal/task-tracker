import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  BackLinkSkeleton,
  PageTitleSkeleton,
  FormFieldsSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Formular-Skeleton (max-w-2xl wie tasks/new) —
// sonst griffe tasks/loading.tsx (Kartenraster).
export default function NewTaskLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container max-w-2xl py-6">
      <BackLinkSkeleton className="w-20" />
      <PageTitleSkeleton className="mb-6 w-44" />
      <FormFieldsSkeleton fields={6} />
    </SkeletonScreen>
  );
}
