"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";

export type ActivityItem = {
  id: string;
  type: string;
  detail: string | null;
  createdAt: string | Date;
  userName: string;
};

type Filter = "all" | "comments" | "status";

const DOT: Record<string, string> = {
  created: "bg-sky-500",
  status: "bg-amber-500",
  reopened: "bg-amber-500",
  assigned: "bg-violet-500",
  priority: "bg-rose-500",
  comment: "bg-teal-500",
  due: "bg-slate-400",
  renamed: "bg-primary",
  description: "bg-slate-500",
  storyPoints: "bg-fuchsia-500",
  timer: "bg-emerald-500",
  attachment: "bg-cyan-500",
  escalated: "bg-rose-600",
  unblocked: "bg-lime-500",
  assist: "bg-primary",
  coaching: "bg-amber-500",
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const { t, locale } = useT();
  const [filter, setFilter] = useState<Filter>("all");

  const shown = items.filter((it) => {
    if (filter === "all") return true;
    if (filter === "comments") return it.type === "comment";
    return it.type === "status" || it.type === "reopened";
  });

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: t("activity.filter.all") },
    { key: "comments", label: t("activity.filter.comments") },
    { key: "status", label: t("activity.filter.status") },
  ];

  return (
    <div>
      <div className="mb-4 inline-flex gap-1 rounded-lg bg-secondary p-1" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={filter === tb.key}
            onClick={() => setFilter(tb.key)}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-medium transition-colors coarse:h-10",
              filter === tb.key
                ? "bg-card text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
      ) : (
        // TOF-0962: Zeitleiste mit Verbindungslinie, Zeit in der UI-Sprache.
        <ol className="relative">
          {shown.map((it, i) => (
            <li key={it.id} className="relative flex gap-3 pb-4 text-sm last:pb-0">
              {i < shown.length - 1 && (
                <span className="absolute start-[4px] top-4 h-full w-px bg-border" aria-hidden />
              )}
              <span
                className={cn(
                  "relative mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full ring-4 ring-background",
                  DOT[it.type] ?? "bg-slate-400"
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="leading-snug">
                  <span className="font-medium">{it.userName}</span>{" "}
                  <span className="text-muted-foreground">
                    {t(`activity.${it.type}` as never)}
                  </span>
                  {it.detail ? (
                    <span className="text-muted-foreground" dir="auto"> · {it.detail}</span>
                  ) : null}
                </p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(it.createdAt).toISOString()}
                  title={formatDateTime(it.createdAt, locale)}
                >
                  {formatRelative(it.createdAt, locale)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
