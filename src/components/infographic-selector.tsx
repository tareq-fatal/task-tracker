"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

const TYPES = ["user", "team", "project"] as const;
const RANGES = ["week", "month", "last30", "quarter", "year", "all"] as const;

export function InfographicSelector({
  type,
  id,
  range,
  entities,
}: {
  type: string;
  id: string | null;
  range: string;
  entities: { id: string; name: string }[];
}) {
  const { t } = useT();
  const router = useRouter();
  const go = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ type, range, ...(id ? { id } : {}), ...params });
    router.push(`/reports/infographics?${sp.toString()}`);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <div className="flex gap-1">
        {TYPES.map((ty) => (
          <button
            key={ty}
            onClick={() => go({ type: ty, id: "" })}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              type === ty ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t(`infographic.${ty}` as TKey)}
          </button>
        ))}
      </div>

      <select
        value={id ?? ""}
        onChange={(e) => go({ id: e.target.value })}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">{t("infographic.select")}…</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      <select
        value={range}
        onChange={(e) => go({ range: e.target.value })}
        className="ms-auto h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {RANGES.map((r) => (
          <option key={r} value={r}>
            {t(`infographic.range.${r}` as TKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
