"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  renamed: "bg-indigo-500",
  description: "bg-slate-500",
  storyPoints: "bg-fuchsia-500",
  timer: "bg-emerald-500",
  attachment: "bg-cyan-500",
  escalated: "bg-rose-600",
  assist: "bg-indigo-600",
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
      <div className="mb-3 flex gap-1">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setFilter(tb.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === tb.key
                ? "bg-sky-100 text-sky-700"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((it) => (
            <li key={it.id} className="flex gap-3 text-sm">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  DOT[it.type] ?? "bg-slate-400"
                )}
              />
              <div className="min-w-0">
                <span className="font-medium">{it.userName}</span>{" "}
                <span className="text-muted-foreground">
                  {t(`activity.${it.type}` as never)}
                </span>
                {it.detail ? (
                  <span className="text-muted-foreground"> · {it.detail}</span>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(it.createdAt, locale)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
