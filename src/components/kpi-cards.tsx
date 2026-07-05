import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiItem = {
  label: string;
  value: string | number;
  accent?: "sky" | "teal" | "amber" | "rose";
};

const ACCENT: Record<NonNullable<KpiItem["accent"]>, string> = {
  sky: "text-sky-600 dark:text-sky-400",
  teal: "text-teal-600 dark:text-teal-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
};

export function KpiCards({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              it.accent ? ACCENT[it.accent] : "text-foreground"
            )}
          >
            {it.value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{it.label}</div>
        </Card>
      ))}
    </div>
  );
}
