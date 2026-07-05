import Link from "next/link";
import { quarterTicks, barPct } from "@/lib/roadmap";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/enums";
import { cn } from "@/lib/utils";

export type Lane = {
  id: string; title: string; kind: "Epic" | "Project";
  color: string; priority: string | null;
  start: number; end: number; total: number; done: number; pct: number;
};

const PRIO_ICON: Record<string, string> = { Critical: "🔴", High: "🟠", Medium: "🟡", Low: "🟢" };

export function RoadmapView({ lanes, from, to, now, doneLabel, locale }: { lanes: Lane[]; from: number; to: number; now: number; doneLabel: string; locale: Locale }) {
  const fmt = (ms: number) => formatDate(ms, locale);
  const ticks = quarterTicks(from, to);
  const todayPct = to > from && now >= from && now <= to ? ((now - from) / (to - from)) * 100 : null;

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <div className="min-w-[720px]">
        {/* Quarter header */}
        <div className="relative h-8 border-b bg-muted/40">
          <div className="absolute inset-y-0 left-[220px] right-0">
            {ticks.map((tk) => (
              <div key={tk.label} className="absolute top-0 flex h-8 items-center" style={{ left: `${tk.xPct}%` }}>
                <span className="border-s ps-1 text-[11px] font-medium text-muted-foreground">{tk.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Lanes */}
        <ul className="relative">
          {/* today marker spanning all lanes */}
          {todayPct !== null && (
            <div className="pointer-events-none absolute inset-y-0 z-10 hidden md:block" style={{ left: `calc(220px + (100% - 220px) * ${todayPct / 100})` }}>
              <div className="h-full w-px bg-rose-400/70" />
              <span className="absolute -top-0 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">•</span>
            </div>
          )}
          {lanes.map((lane) => {
            const { leftPct, widthPct } = barPct(lane.start, lane.end, from, to);
            const tip = `${lane.title} · ${fmt(lane.start)} → ${fmt(lane.end)} · ${lane.done}/${lane.total} ${doneLabel} (${lane.pct}%)`;
            return (
              <li key={lane.id} className="relative flex items-center border-b last:border-b-0 hover:bg-muted/30" data-testid="roadmap-lane">
                <div className="flex w-[220px] shrink-0 items-center gap-2 px-3 py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />
                  {lane.priority && <span className="text-xs" aria-hidden>{PRIO_ICON[lane.priority] ?? ""}</span>}
                  <Link href={lane.kind === "Epic" ? `/tasks/${lane.id}` : `/projects/${lane.id}`} className="truncate text-sm font-medium hover:underline" title={lane.title}>
                    {lane.title}
                  </Link>
                </div>
                <div className="relative h-12 flex-1">
                  {/* quarter gridlines */}
                  {ticks.map((tk) => (
                    <div key={tk.label} className="absolute inset-y-0 border-s border-dashed border-muted" style={{ left: `${tk.xPct}%` }} />
                  ))}
                  {/* rounded gradient bar with progress fill + milestone diamond at the end */}
                  <div
                    className="absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-full shadow-sm ring-1 ring-black/5"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: `linear-gradient(90deg, ${lane.color}, ${lane.color}bb)` }}
                    title={tip}
                  >
                    <div className="h-full bg-white/30" style={{ width: `${lane.pct}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center px-1 text-[11px] font-semibold text-white drop-shadow">
                      {lane.total > 0 ? `${lane.pct}%` : ""}
                    </span>
                  </div>
                  {/* milestone diamond at the lane end */}
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 rounded-[2px] shadow"
                    style={{ left: `calc(${leftPct + widthPct}% - 5px)`, backgroundColor: lane.color }}
                    title={`${fmt(lane.end)}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
