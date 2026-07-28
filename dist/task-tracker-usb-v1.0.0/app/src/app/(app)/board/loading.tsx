import { Skeleton } from "@/components/skeleton";

export default function BoardLoading() {
  return (
    <div className="container py-6">
      <Skeleton className="mb-4 h-8 w-40" />
      <Skeleton className="mb-5 h-10 w-full max-w-xl" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 3 }).map((_, c) => (
          <div key={c} className="w-[82vw] shrink-0 sm:w-80">
            <Skeleton className="mb-2 h-5 w-24" />
            <div className="space-y-2.5 rounded-2xl border border-dashed bg-muted/30 p-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border bg-card p-4">
                  <Skeleton className="mb-3 h-4 w-3/4" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
