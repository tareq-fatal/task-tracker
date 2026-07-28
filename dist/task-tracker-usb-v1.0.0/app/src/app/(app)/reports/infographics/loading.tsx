import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="container py-6">
      <Skeleton className="mb-6 h-8 w-40" />
      <Skeleton className="mb-5 h-10 w-full max-w-md rounded-md" />
      <Skeleton className="mb-5 h-40 w-full rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    </div>
  );
}
