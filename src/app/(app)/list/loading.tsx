import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  PageTitleSkeleton,
  Skeleton,
  TableRowsSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Listen-Skeleton wie task-table.tsx —
// Werkzeugleiste (Gruppieren/Dichte), Tabelle mit Auswahl, Vorschau, Titel,
// Status, Zuständig, Fällig, Priorität, Tags, SP.
export default function ListLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container py-6">
      <PageTitleSkeleton className="mb-4 w-40" />
      <div className="pb-20">
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-11" />
        </div>
        <TableRowsSkeleton
          columns={["w-4", "w-9", "w-48", "w-16", "w-24", "w-20", "w-14", "w-16", "w-6"]}
          rows={8}
        />
      </div>
    </SkeletonScreen>
  );
}
