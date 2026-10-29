import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  PageTitleSkeleton,
  Skeleton,
  SkeletonChip,
  TableRowsSkeleton,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Leads wie projects/[id]/leads/page.tsx —
// Kopf, eingeklappter "Neuer Lead"-Block (Card p-5), Status-Chips, Tabelle
// mit 8 Spalten (Firma … Aktionen).
export default function LeadsLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container space-y-6 py-6">
      <div>
        <Skeleton className="mb-2 h-5 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <PageTitleSkeleton className="w-32" />
        </div>
        <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
      </div>

      <div aria-hidden="true" className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex h-6 items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
        {["w-12", "w-12", "w-20", "w-14", "w-14", "w-14"].map((w, i) => (
          <SkeletonChip key={i} className={w} />
        ))}
        <SkeletonChip className="ms-auto w-28" />
      </div>

      <TableRowsSkeleton
        className="overflow-x-auto rounded-lg border bg-card"
        cellClassName="px-3 py-2"
        columns={["w-32", "w-24", "w-20", "w-24", "w-16", "w-28", "w-8", "w-24"]}
        rows={6}
      />
    </SkeletonScreen>
  );
}
