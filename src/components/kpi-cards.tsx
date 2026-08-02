import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiItem = {
  label: string;
  value: string | number;
  accent?: "sky" | "teal" | "amber" | "rose";
  /** Mobile-simplify 2026-08: phones show only 2 KPIs — "mobile" hides the
   *  card below md, "desktop" shows it ONLY below md. */
  hide?: "mobile" | "desktop";
};

const ACCENT: Record<NonNullable<KpiItem["accent"]>, string> = {
  sky: "text-sky-600",
  teal: "text-teal-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
};

export function KpiCards({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card
          key={it.label}
          className={cn(
            "p-4",
            it.hide === "mobile" && "hidden md:block",
            it.hide === "desktop" && "md:hidden"
          )}
        >
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
