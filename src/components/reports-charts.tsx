"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { BurndownPoint } from "@/lib/reports";

type WorkloadRow = { name: string; todo: number; inProgress: number; done: number };

type Labels = {
  burndown: string;
  workload: string;
  open: string;
  done: string;
  todo: string;
  inProgress: string;
  empty: string;
};

const SKY = "#0ea5e9";
const TEAL = "#14b8a6";
const AMBER = "#f59e0b";

export function ReportsCharts({
  burndown,
  workload,
  labels,
}: {
  burndown: BurndownPoint[];
  workload: WorkloadRow[];
  labels: Labels;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{labels.burndown}</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={burndown} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="open" name={labels.open} stackId="1" stroke={SKY} fill={SKY} fillOpacity={0.25} />
            <Area type="monotone" dataKey="done" name={labels.done} stackId="1" stroke={TEAL} fill={TEAL} fillOpacity={0.4} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{labels.workload}</h2>
        {workload.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={workload} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="todo" name={labels.todo} stackId="w" fill={SKY} />
              <Bar dataKey="inProgress" name={labels.inProgress} stackId="w" fill={AMBER} />
              <Bar dataKey="done" name={labels.done} stackId="w" fill={TEAL} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
