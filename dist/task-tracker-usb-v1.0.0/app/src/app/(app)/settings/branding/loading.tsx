import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="container max-w-3xl py-6">
      <Skeleton className="mb-1 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
