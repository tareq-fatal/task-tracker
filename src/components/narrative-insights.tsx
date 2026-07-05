"use client";

import { Sparkles } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import type { Narrative } from "@/lib/narrative";
import { cn } from "@/lib/utils";

// A fixed reference Sunday (2023-01-01) → localized weekday name.
const weekdayName = (weekday: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(Date.UTC(2023, 0, 1 + weekday)));

export function NarrativeInsights({ items }: { items: Narrative[] }) {
  const { t, tp, locale } = useT();
  if (items.length === 0) return null;

  const line = (n: Narrative): string => {
    switch (n.kind) {
      case "streak": return tp("nar.streak", n.days);
      case "bestDay": return t("nar.bestDay", { day: weekdayName(n.weekday, locale) });
      case "trend": return n.up ? t("nar.trendUp", { pct: n.deltaPct }) : t("nar.trendDown", { pct: n.deltaPct });
      case "forecast": return n.early ? tp("nar.forecastEarly", n.deltaDays) : tp("nar.forecastLate", n.deltaDays);
      case "recommend": return tp("nar.recommend", n.overdue, { p: n.priority });
    }
  };

  return (
    <section className="mb-5">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Sparkles className="h-4 w-4 text-fuchsia-500" /> {t("nar.title")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((n, i) => (
          <div
            key={i}
            data-testid="narrative"
            className={cn(
              "group flex items-center gap-3 rounded-xl border bg-gradient-to-r from-indigo-50/70 to-fuchsia-50/70 p-3 shadow-sm transition-transform hover:-translate-y-0.5",
              "dark:from-indigo-950/30 dark:to-fuchsia-950/30"
            )}
          >
            <span className="text-2xl transition-transform group-hover:scale-110">{n.icon}</span>
            <span className="text-sm font-medium leading-snug">{line(n)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
