import { cn } from "@/lib/utils";

/** Thin gradient progress bar (Sky → Teal → Emerald), 0–100. */
export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-secondary",
        className
      )}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-emerald-500 to-emerald-500 transition-[width] duration-300"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
