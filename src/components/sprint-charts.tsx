"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { BurndownPoint } from "@/lib/sprints";

const INDIGO = "#6366f1";
const PINK = "#ec4899";
const EMERALD = "#10b981";

export function SprintBurndown({
  data,
  labels,
}: {
  data: BurndownPoint[];
  labels: { remaining: string; ideal: string; empty: string };
}) {
  if (data.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">{labels.empty}</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} minTickGap={20} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="ideal" name={labels.ideal} stroke="#cbd5e1" strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="remaining" name={labels.remaining} stroke={INDIGO} strokeWidth={2} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SprintVelocity({
  data,
  labels,
}: {
  data: Array<{ name: string; completed: number; total: number }>;
  labels: { completed: string; total: string; empty: string };
}) {
  if (data.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">{labels.empty}</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="total" name={labels.total} fill="#e2e8f0" radius={[4, 4, 0, 0]} />
        <Bar dataKey="completed" name={labels.completed} fill={EMERALD} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
