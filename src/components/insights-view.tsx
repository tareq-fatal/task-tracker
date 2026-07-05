"use client";

import { TrendingUp, TrendingDown, Minus, AlertTriangle, Timer, Gauge, Zap } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { Direction } from "@/lib/insights";

export type InsightsData = {
  trend: { current: number; deltaPct: number; direction: Direction };
  forecast: { daysLeft: number | null; delta: number | null; sprintName: string | null } | null;
  burnout: { name: string; open: number; overdue: number; risk: "high" | "medium" }[];
  bottleneck: { status: string; avgAgeDays: number; count: number } | null;
  effort: { hoursPerPoint: number; ratio: number; sampleSize: number } | null;
  hasData: boolean;
};

function Glass({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur", className)}>
      <div className="pointer-events-none absolute -end-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-400/20 to-fuchsia-400/20 blur-2xl" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function InsightsView({ data }: { data: InsightsData }) {
  const { t } = useT();
  if (!data.hasData) {
    return <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("ins.empty")}</p>;
  }

  const dir = data.trend.direction;
  const TrendIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Trend hero */}
      <Glass className="md:col-span-2 bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 text-white">
        <p className="text-sm font-medium text-white/80">{t("ins.trend")}</p>
        <div className="mt-1 flex items-end gap-4">
          <span className="text-5xl font-black tabular-nums"><CountUp value={data.trend.current} /></span>
          <span className={cn("mb-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-sm font-bold")}>
            <TrendIcon className="h-4 w-4" />
            {data.trend.deltaPct > 0 ? "+" : ""}{data.trend.deltaPct}% <span className="font-normal text-white/70">{t("ins.vsLastWeek")}</span>
          </span>
        </div>
      </Glass>

      {/* Forecast */}
      <Glass>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Gauge className="h-4 w-4 text-indigo-500" /> {t("ins.forecast")}</div>
        {data.forecast ? (
          data.forecast.daysLeft === null ? (
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{t("ins.stalled")}</p>
          ) : (
            <div>
              <p className="text-3xl font-black tabular-nums"><CountUp value={data.forecast.daysLeft} /> <span className="text-base font-medium text-muted-foreground">{t("ins.days")}</span></p>
              {data.forecast.delta !== null && (
                <p className={cn("mt-1 text-sm font-semibold", data.forecast.delta > 0 ? "text-rose-600 dark:text-rose-400" : data.forecast.delta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                  {data.forecast.delta === 0 ? t("ins.onTrack") : `${Math.abs(data.forecast.delta)} ${data.forecast.delta > 0 ? t("ins.late") : t("ins.early")}`}
                  {data.forecast.sprintName ? ` · ${data.forecast.sprintName}` : ""}
                </p>
              )}
            </div>
          )
        ) : <p className="text-sm text-muted-foreground">—</p>}
      </Glass>

      {/* Bottleneck */}
      <Glass>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Timer className="h-4 w-4 text-amber-500" /> {t("ins.bottleneck")}</div>
        {data.bottleneck ? (
          <div>
            <p className="text-2xl font-black">{data.bottleneck.status}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("ins.avgAge")}: <b className="text-foreground">{data.bottleneck.avgAgeDays} {t("ins.days")}</b> · {data.bottleneck.count} {t("ins.open")}</p>
          </div>
        ) : <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("ins.bottleneckNone")}</p>}
      </Glass>

      {/* Burnout */}
      <Glass className="md:col-span-2">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><AlertTriangle className="h-4 w-4 text-rose-500" /> {t("ins.burnout")}</div>
        {data.burnout.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("ins.burnoutNone")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.burnout.map((u) => (
              <li key={u.name} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", u.risk === "high" ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10" : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10")}>
                <span className={cn("text-lg", u.risk === "high" ? "grayscale-0" : "")}>{u.risk === "high" ? "🚨" : "⚠️"}</span>
                <span className="font-semibold">{u.name}</span>
                <span className="text-muted-foreground">{u.open} {t("ins.open")} · {u.overdue} {t("ins.overdue")}</span>
              </li>
            ))}
          </ul>
        )}
      </Glass>

      {/* Effort vs reality */}
      <Glass className="md:col-span-2">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Zap className="h-4 w-4 text-fuchsia-500" /> {t("ins.effort")}</div>
        {data.effort ? (
          <div className="flex items-end gap-4">
            <p className="text-3xl font-black tabular-nums"><CountUp value={data.effort.hoursPerPoint} decimals={1} /> <span className="text-base font-medium text-muted-foreground">{t("ins.hoursPerPoint")}</span></p>
            <div className="mb-1 h-3 flex-1 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`ratio ${data.effort.ratio}`}>
              <div className={cn("h-full rounded-full", data.effort.ratio > 1.2 ? "bg-rose-500" : data.effort.ratio < 0.8 ? "bg-sky-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, data.effort.ratio * 50)}%` }} />
            </div>
          </div>
        ) : <p className="text-sm text-muted-foreground">—</p>}
      </Glass>
    </div>
  );
}
