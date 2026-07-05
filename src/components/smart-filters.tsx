import Link from "next/link";

export type SmartPreset = { label: string; href: string };

/** Linear-style quick-filter chips that link to pre-built FilterBar URLs. */
export function SmartFilters({ presets }: { presets: SmartPreset[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {presets.map((p) => (
        <Link
          key={p.label}
          href={p.href}
          className="rounded-full border border-input bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
