"use client";

import { CountUp } from "@/components/count-up";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { DonutChart, MiniBars, ProgressRing } from "@/components/infographic-charts";
import { ExportButtons } from "@/components/infographic-export";
import { initials } from "@/lib/tasks";
import type { HeatCell, Slice } from "@/lib/infographics";

export type InfographicData = {
  title: string;
  subtitle: string;
  score: number;
  kpis: { label: string; value: number; accent: string; dec?: number }[];
  heatmap: HeatCell[];
  statusDist: Slice[];
  priorityDist: Slice[];
  breakdown: { name: string; value: number }[];
  breakdownLabel: string;
  prediction: { remaining: number; perDay: number; daysLeft: number | null };
};

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      {title && <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>}
      {children}
    </section>
  );
}

export function InfographicView({
  data,
  labels: L,
  filename,
  brandLogo,
  brandName,
}: {
  data: InfographicData;
  labels: Record<string, string>;
  filename: string;
  brandLogo?: string | null;
  brandName?: string;
}) {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ExportButtons targetId="infographic-capture" filename={filename} />
      </div>
      <div id="infographic-capture" className="space-y-5 stagger">
        {/* Hero — tenant-branded (brand-gradient follows the tenant colours) */}
        <section className="brand-gradient relative overflow-hidden rounded-3xl border p-6 text-white shadow-lg">
          <div className="pointer-events-none absolute -end-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
          {(brandLogo || brandName) && (
            <div className="relative mb-4 flex items-center gap-2">
              {brandLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brandLogo} alt={brandName ?? ""} className="h-6 max-w-[140px] object-contain brightness-0 invert" />
              ) : (
                <span className="text-sm font-bold text-white/90">{brandName}</span>
              )}
            </div>
          )}
          <div className="relative flex flex-wrap items-center gap-6">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl font-black">
              {initials(data.title)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black">{data.title}</h1>
              <p className="text-sm text-white/80">{data.subtitle}</p>
              <div className="mt-3 flex flex-wrap gap-6">
                {data.kpis.map((kp) => (
                  <div key={kp.label}>
                    <div className="text-3xl font-black tabular-nums">
                      <CountUp value={kp.value} decimals={kp.dec ?? 0} />
                    </div>
                    <div className="text-xs text-white/80">{kp.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white/15 p-2">
              <ProgressRing value={data.score} size={84} stroke={9} label={L.score} />
            </div>
          </div>
        </section>

        <Card title={L.activity}>
          <ActivityHeatmap cells={data.heatmap} label={L.activity} />
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title={L.statusDist}>
            <DonutChart data={data.statusDist} centerLabel={L.total} />
          </Card>
          <Card title={L.priorityDist}>
            <DonutChart data={data.priorityDist} />
          </Card>
          <Card title={data.breakdownLabel}>
            {data.breakdown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{L.empty}</p>
            ) : (
              <MiniBars data={data.breakdown} />
            )}
          </Card>
        </div>

        {data.prediction.daysLeft != null && (
          <Card>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
              <span>
                <span className="font-semibold">{L.prediction}:</span> ~{data.prediction.daysLeft} {L.days}
              </span>
              <span className="text-muted-foreground">
                {data.prediction.remaining} {L.open} · {data.prediction.perDay}/{L.days}
              </span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
