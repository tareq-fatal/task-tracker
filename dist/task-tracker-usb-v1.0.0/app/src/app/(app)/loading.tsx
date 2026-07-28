import { Skeleton, CardGridSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="container py-6">
      <Skeleton className="mb-6 h-8 w-48" />
      <Skeleton className="mb-4 h-4 w-32" />
      <CardGridSkeleton count={8} />
    </div>
  );
}
