import { Skeleton, CardGridSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="container py-6">
      <Skeleton className="mb-4 h-8 w-44" />
      <div className="mb-5 flex gap-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
      <CardGridSkeleton count={9} />
    </div>
  );
}
