"use client";

import Link from "next/link";
import { Sparkles, TrendingUp, Flame, Trophy } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import {
  DonutChart,
  GradientArea,
  Sparkline,
  ProgressRing,
  MiniBars,
} from "@/components/infographic-charts";
import { ExportButtons } from "@/components/infographic-export";
import { Button } from "@/components/ui/button";
import type { Kpis, BurndownPoint } from "@/lib/reports";
import type { HeatCell, Slice } from "@/lib/infographics";

type Labels = Record<string, string>;

type Data = {
  kpis: Kpis;
  burndown: BurndownPoint[];
  workload: { name: string; todo: number; inProgress: number; done: number }[];
  heatmap: HeatCell[];
  statusDist: Slice[];
  priorityDist: Slice[];
  topProjects: { name: string; count: number }[];
  score: number;
  streak: number;
  bestDay: { date: string; count: number } | null;
  prediction: { remaining: number; perDay: number; daysLeft: number | null };
  doneSparkline: number[];
};

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>}
      {children}
    </section>
  );
}

export function ReportsDashboard({ data, labels: L }: { data: Data; labels: Labels }) {
  const k = data.kpis;
  return (
    <div className="container py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{L.title}</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/reports/infographics">
              <Sparkles className="me-1 h-4 w-4" />
              {L.infographics}
            </Link>
          </Button>
          <ExportButtons targetId="report-capture" filename="task-tracker-report" />
        </div>
      </div>

      <div id="report-capture" className="space-y-5 stagger">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 p-6 text-white shadow-lg">
          <div className="pointer-events-none absolute -end-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 start-1/3 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <div className="text-4xl font-black tabular-nums">
                <CountUp value={k.total} />
              </div>
              <div className="mt-1 text-sm text-white/80">{L.total}</div>
            </div>
            <div>
              <div className="text-4xl font-black tabular-nums">
                <CountUp value={k.done} />
              </div>
              <div className="mt-1 text-sm text-white/80">{L.done}</div>
            </div>
            <div>
              <div className="text-4xl font-black tabular-nums">
                <CountUp value={k.doneThisWeek} />
              </div>
              <div className="mt-1 text-sm text-white/80">{L.doneWeek}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/15 p-1.5">
                <ProgressRing value={data.score} size={72} stroke={8} />
              </div>
              <div className="text-sm text-white/80">{L.score}</div>
            </div>
          </div>
        </section>

        {/* KPI tiles with sparklines */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: L.open, value: k.open, accent: "#6366f1" },
            { label: L.overdue, value: k.overdue, accent: "#f43f5e" },
            { label: L.avgDays, value: k.avgCompletionDays ?? 0, accent: "#10b981", dec: 1 },
            { label: L.streak, value: data.streak, accent: "#f59e0b", suffix: " 🔥" },
          ].map((tile) => (
            <Card key={tile.label}>
              <div className="text-2xl font-bold tabular-nums" style={{ color: tile.accent }}>
                <CountUp value={tile.value} decimals={tile.dec ?? 0} suffix={tile.suffix ?? ""} />
              </div>
              <div className="mb-1 text-xs text-muted-foreground">{tile.label}</div>
              <Sparkline data={data.doneSparkline} color={tile.accent} />
            </Card>
          ))}
        </div>

        {/* Activity heatmap + pull quotes */}
        <Card title={L.activity}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <ActivityHeatmap cells={data.heatmap} label={L.activity} />
            <div className="flex flex-col gap-2">
              {data.bestDay && data.bestDay.count > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span>
                    <span className="font-semibold">{L.bestDay}:</span> {data.bestDay.date} ·{" "}
                    {data.bestDay.count}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-500/10">
                <Flame className="h-4 w-4 text-emerald-500" />
                <span>
                  <span className="font-semibold">{L.streak}:</span> {data.streak}
                </span>
              </div>
              {data.prediction.daysLeft != null && (
                <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm dark:bg-indigo-500/10">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  <span>
                    <span className="font-semibold">{L.prediction}:</span> ~{data.prediction.daysLeft}{" "}
                    {L.days}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Donuts + gradient burndown */}
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title={L.statusDist}>
            <DonutChart data={data.statusDist} centerLabel={L.total} centerValue={k.total} />
          </Card>
          <Card title={L.priorityDist}>
            <DonutChart data={data.priorityDist} />
          </Card>
          <Card title={L.burndown}>
            <GradientArea data={data.burndown} dataKey="open" />
          </Card>
        </div>

        {/* Workload + top projects */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={L.workload}>
            {data.workload.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{L.empty}</p>
            ) : (
              <MiniBars data={data.workload.map((w) => ({ name: w.name, value: w.todo + w.inProgress + w.done }))} />
            )}
          </Card>
          <Card title={L.topProjects}>
            {data.topProjects.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{L.empty}</p>
            ) : (
              <MiniBars data={data.topProjects.map((p) => ({ name: p.name, value: p.count }))} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
