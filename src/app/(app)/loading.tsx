import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { SkeletonScreen, Skeleton } from "@/components/skeleton";

// TOF-0789/TOF-0962: Dashboard-Skeleton — gleicher Container, Kopf,
// 4 Kennzahl-Kacheln und die Zeilen-Panels wie page.tsx. Auch Fallback für
// (app)-Routen ohne eigene loading.tsx, daher allgemein gehalten.
function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex h-[49px] items-center gap-2 border-b px-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-2 w-2 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={i % 2 ? "h-3.5 w-2/3" : "h-3.5 w-1/2"} />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="hidden h-3 w-16 xs:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  const t = getDictionary(getActiveLocale());
  return (
    <SkeletonScreen label={t["common.loading"]} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} aria-hidden="true" className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-3 h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PanelSkeleton rows={5} />
          <PanelSkeleton rows={5} />
        </div>
        <div className="space-y-6">
          <PanelSkeleton rows={4} />
        </div>
      </div>
    </SkeletonScreen>
  );
}
