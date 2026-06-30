import Link from "next/link";
import { quarterTicks, barPct } from "@/lib/roadmap";
import { cn } from "@/lib/utils";

export type Lane = {
  id: string; title: string; kind: "Epic" | "Project";
  start: number; end: number; total: number; done: number; pct: number;
};

const LANE_COLOR = { Epic: "bg-violet-500", Project: "bg-sky-500" };

export function RoadmapView({ lanes, from, to, doneLabel }: { lanes: Lane[]; from: number; to: number; doneLabel: string }) {
  const ticks = quarterTicks(from, to);

  return (
    <div className="overflow-x-auto rounded-xl border">
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
        <ul>
          {lanes.map((lane) => {
            const { leftPct, widthPct } = barPct(lane.start, lane.end, from, to);
            return (
              <li key={lane.id} className="relative flex items-center border-b last:border-b-0 hover:bg-muted/30" data-testid="roadmap-lane">
                <div className="flex w-[220px] shrink-0 items-center gap-2 px-3 py-3">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", lane.kind === "Epic" ? "bg-violet-500" : "bg-sky-500")} />
                  <Link href={lane.kind === "Epic" ? `/tasks/${lane.id}` : `/projects/${lane.id}`} className="truncate text-sm font-medium hover:underline" title={lane.title}>
                    {lane.title}
                  </Link>
                </div>
                <div className="relative h-12 flex-1">
                  {/* quarter gridlines */}
                  {ticks.map((tk) => (
                    <div key={tk.label} className="absolute inset-y-0 border-s border-dashed border-muted" style={{ left: `${tk.xPct}%` }} />
                  ))}
                  {/* bar with progress fill */}
                  <div
                    className={cn("absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md shadow-sm", LANE_COLOR[lane.kind])}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={`${lane.done}/${lane.total} ${doneLabel} (${lane.pct}%)`}
                  >
                    <div className="h-full bg-black/25" style={{ width: `${lane.pct}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center px-1 text-[11px] font-semibold text-white">
                      {lane.total > 0 ? `${lane.pct}%` : ""}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
