"use client";

import { heatLevel, type HeatCell } from "@/lib/infographics";

// Level 0 uses the theme's muted token so empty cells work in dark mode too.
const LEVEL_FILL = [
  null, // 0 → fill-muted
  "#c7d2fe", // 1 indigo-200
  "#818cf8", // 2 indigo-400
  "#6366f1", // 3 indigo-500
  "#4338ca", // 4 indigo-700
];

/** GitHub-style contribution heatmap (hand-rolled SVG, Ocean-Pro palette). */
export function ActivityHeatmap({
  cells,
  label,
}: {
  cells: HeatCell[];
  label?: string;
}) {
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  // pad to whole weeks starting on the cell's weekday
  const first = cells[0] ? new Date(cells[0].date + "T00:00:00Z").getUTCDay() : 0;
  const pad = (first + 6) % 7; // weeks start Monday
  const padded: (HeatCell | null)[] = [...Array(pad).fill(null), ...cells];
  const weeks = Math.ceil(padded.length / 7);
  const size = 12;
  const gap = 3;

  return (
    <div>
      <svg
        width={weeks * (size + gap)}
        height={7 * (size + gap)}
        className="max-w-full"
        role="img"
        aria-label={label ?? "activity heatmap"}
      >
        {padded.map((c, i) => {
          const week = Math.floor(i / 7);
          const day = i % 7;
          if (!c) return null;
          const lvl = heatLevel(c.count, max);
          return (
            <rect
              key={c.date}
              x={week * (size + gap)}
              y={day * (size + gap)}
              width={size}
              height={size}
              rx={3}
              className={lvl === 0 ? "fill-muted" : undefined}
              fill={LEVEL_FILL[lvl] ?? undefined}
            >
              <title>{`${c.date}: ${c.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>−</span>
        {LEVEL_FILL.map((f, i) => (
          <span
            key={i}
            className={`inline-block h-2.5 w-2.5 rounded-sm ${f ? "" : "bg-muted"}`}
            style={f ? { background: f } : undefined}
          />
        ))}
        <span>+</span>
      </div>
    </div>
  );
}
