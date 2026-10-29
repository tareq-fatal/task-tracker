import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { SkeletonScreen, PageTitleSkeleton, Skeleton } from "@/components/skeleton";

// TOF-0789 (Tarek 29.10.2026): Mandanten-Übersicht wie admin/mandanten/page.tsx —
// Zeilen mit Farbpunkt, Name, /slug, Kennzahlen-Gruppe, 4 Schalter (Spalte),
// Öffnen/Umbenennen/Löschen; darunter der Assistent-Block.
export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="container max-w-3xl py-6">
      <PageTitleSkeleton className="w-40" />
      <Skeleton className="mb-6 mt-2 h-3.5 w-64 max-w-full" />

      <ul aria-hidden="true" className="mb-6 space-y-2">
        {["w-32", "w-24", "w-40", "w-28"].map((nameW, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
            <Skeleton className={`h-4 ${nameW}`} />
            <Skeleton className="h-3 w-16" />
            <span className="ms-auto flex flex-wrap gap-x-3 gap-y-1">
              {["w-16", "w-20", "w-14", "w-12"].map((w, k) => (
                <Skeleton key={k} className={`h-3 ${w}`} />
              ))}
            </span>
            <Skeleton className="h-6 w-14" />
            {/* TenantFeatureToggles: 4 Checkbox-Zeilen (h-4, gap-1) */}
            <div className="flex flex-col gap-1">
              {["w-24", "w-28", "w-24", "w-20"].map((w, k) => (
                <div key={k} className="flex h-4 items-center gap-1.5">
                  <Skeleton className="h-4 w-4 rounded-sm" />
                  <Skeleton className={`h-3 ${w}`} />
                </div>
              ))}
            </div>
            <Skeleton className="h-9 w-10" />
            <Skeleton className="h-9 w-10" />
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="rounded-xl border-2 border-indigo-100 bg-indigo-50/40 p-4">
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
