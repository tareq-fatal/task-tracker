// Dependency-free inline-SVG line/area chart. Always LTR (time axis).
type Point = { label: string; count: number };

export function LineChart({
  data,
  height = 180,
  unitLabel,
}: {
  data: Point[];
  height?: number;
  unitLabel?: string;
}) {
  const W = 640;
  const H = height;
  const padX = 28;
  const padTop = 16;
  const padBottom = 26;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const xy = (i: number, v: number) => {
    const x = padX + i * stepX;
    const y = padTop + innerH - (v / max) * innerH;
    return [x, y] as const;
  };

  const linePts = data.map((d, i) => xy(i, d.count));
  const linePath = linePts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    linePts.length > 0
      ? `${linePath} L${(padX + (n - 1) * stepX).toFixed(1)},${(
          padTop + innerH
        ).toFixed(1)} L${padX.toFixed(1)},${(padTop + innerH).toFixed(1)} Z`
      : "";

  // gridlines (0, mid, max)
  const gridYs = [0, 0.5, 1].map((f) => padTop + innerH - f * innerH);
  // x labels: show ~6 evenly spaced
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div dir="ltr" className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <defs>
          <linearGradient id="ttArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(199 89% 48%)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(173 80% 40%)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="ttLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(199 89% 48%)" />
            <stop offset="100%" stopColor="hsl(173 80% 40%)" />
          </linearGradient>
        </defs>

        {gridYs.map((y, i) => (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={y}
            y2={y}
            stroke="hsl(214 32% 91%)"
            strokeWidth="1"
            strokeDasharray={i === 2 ? "0" : "3 3"}
          />
        ))}
        <text x={padX} y={padTop + 4} fontSize="10" fill="hsl(220 9% 60%)">
          {max}
        </text>

        {areaPath && <path d={areaPath} fill="url(#ttArea)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="url(#ttLine)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {linePts.map(([x, y], i) =>
          data[i].count > 0 ? (
            <circle key={i} cx={x} cy={y} r="2.6" fill="hsl(199 89% 48%)">
              <title>{`${data[i].label}: ${data[i].count}${
                unitLabel ? " " + unitLabel : ""
              }`}</title>
            </circle>
          ) : null
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text
              key={i}
              x={padX + i * stepX}
              y={H - 8}
              fontSize="9"
              textAnchor="middle"
              fill="hsl(220 9% 60%)"
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>
      {unitLabel && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {total} {unitLabel}
        </p>
      )}
    </div>
  );
}
