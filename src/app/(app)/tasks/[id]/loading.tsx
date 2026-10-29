import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  SkeletonScreen,
  BackLinkSkeleton,
  PageTitleSkeleton,
  SectionTitleSkeleton,
  Skeleton,
  SkeletonChip,
  SkeletonText,
  SkeletonAvatar,
} from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Aufgabendetail wie tasks/[id]/page.tsx —
// einspaltig (max-w-3xl, auch mobil): Kopf mit Titel + Buttons, Chips,
// Beschreibung/Eigenschaften-Card, Zeiterfassung, Fortschritt|Unteraufgaben,
// Anhänge, Kommentare. Eigene Datei, damit tasks/loading.tsx (Kartenraster)
// hier nicht greift.
export default function TaskDetailLoading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container max-w-3xl py-6">
      <BackLinkSkeleton className="w-20" />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageTitleSkeleton className="w-72 max-w-full" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <div aria-hidden="true" className="mb-4 flex flex-wrap items-center gap-2">
        <SkeletonChip className="w-14" />
        <SkeletonChip className="w-20" />
        <SkeletonChip className="w-16" />
        <SkeletonChip className="w-24" />
      </div>

      {/* Beschreibung + Eigenschaften */}
      <div aria-hidden="true" className="mb-6 rounded-lg border bg-card shadow-sm">
        <div className="space-y-4 p-5">
          <SkeletonText lines={3} className="py-1" />
          <div className="grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div className="flex h-6 items-center gap-2 sm:col-span-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-3.5 w-20" />
              <SkeletonChip className="w-28" />
            </div>
            <div className="flex h-5 items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-3.5 w-32" />
            </div>
            <div className="flex h-5 items-center gap-2">
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        </div>
      </div>

      {/* Zeiterfassung */}
      <div aria-hidden="true" className="mb-6 rounded-lg border bg-card p-5 shadow-sm">
        <SectionTitleSkeleton className="w-28" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>

      {/* Fortschritt | Unteraufgaben */}
      <div aria-hidden="true" className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-5 shadow-sm">
            <SectionTitleSkeleton className="w-24" />
            <Skeleton className="mb-3 h-2 w-full rounded-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>

      {/* Anhänge */}
      <section aria-hidden="true" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </section>

      {/* Kommentare */}
      <section aria-hidden="true">
        <SectionTitleSkeleton className="w-32" />
        <div className="mb-4 space-y-3">
          {["w-3/4", "w-1/2"].map((w, i) => (
            <div key={i} className="flex gap-3">
              <SkeletonAvatar />
              <div className="flex-1 rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className={`h-3 ${w}`} />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-20 w-full" />
      </section>
    </SkeletonScreen>
  );
}
