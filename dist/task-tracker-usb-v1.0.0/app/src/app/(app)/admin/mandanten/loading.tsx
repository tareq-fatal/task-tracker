import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="container max-w-3xl py-6">
      <Skeleton className="mb-1 h-8 w-40" />
      <Skeleton className="mb-6 h-4 w-64" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    </div>
  );
}
