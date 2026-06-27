import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat";

const ACCENTS = {
  sky: "from-indigo-500/10 to-indigo-500/0 text-indigo-600",
  teal: "from-emerald-500/10 to-emerald-500/0 text-emerald-600",
  emerald: "from-emerald-500/10 to-emerald-500/0 text-emerald-600",
  rose: "from-rose-500/10 to-rose-500/0 text-rose-600",
  amber: "from-amber-500/10 to-amber-500/0 text-amber-600",
} as const;

export function StatCard({
  label,
  value,
  hint,
  trend,
  trendLabel,
  icon: Icon,
  accent = "sky",
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: Trend;
  trendLabel?: string;
  icon?: React.ElementType;
  accent?: keyof typeof ACCENTS;
}) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
        ? "text-rose-600"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-bl",
          ACCENTS[accent].split(" ").slice(0, 2).join(" ")
        )}
      />
      <div className="relative">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {Icon && (
            <span className={cn("text-current", ACCENTS[accent].split(" ").pop())}>
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums tracking-tight">
            {value}
          </span>
          {hint && (
            <span className="text-sm text-muted-foreground">{hint}</span>
          )}
        </div>
        {trend && trendLabel && (
          <div className={cn("mt-2 flex items-center gap-1 text-xs", trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trendLabel}
          </div>
        )}
      </div>
    </div>
  );
}
