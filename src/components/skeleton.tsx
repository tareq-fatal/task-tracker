import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-secondary/70", className)} />
  );
}

/** Grid of card-shaped skeletons (dashboard / lists). */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <Skeleton className="mb-3 h-3 w-1/3" />
          <Skeleton className="mb-3 h-4 w-3/4" />
          <Skeleton className="mb-3 h-2 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
