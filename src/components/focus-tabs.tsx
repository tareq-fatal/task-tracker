"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
export type FocusView = "all" | "person" | "team" | "project" | "operations";

const TABS: { view: FocusView; key: string }[] = [
  { view: "all", key: "focus.all" },
  { view: "person", key: "focus.person" },
  { view: "team", key: "focus.team" },
  { view: "project", key: "focus.project" },
  { view: "operations", key: "focus.operations" },
];

export function FocusTabs({
  view, id, users, teams, projects,
}: { view: FocusView; id: string | null; users: Opt[]; teams: Opt[]; projects: Opt[] }) {
  const { t } = useT();
  const router = useRouter();

  const picker = view === "person" ? users : view === "team" ? teams : view === "project" ? projects : null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.view}
            href={`/tasks?view=${tab.view}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === tab.view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(tab.key as never)}
          </Link>
        ))}
      </nav>

      {picker && (
        <select
          value={id ?? ""}
          onChange={(e) => router.push(`/tasks?view=${view}${e.target.value ? `&id=${e.target.value}` : ""}`)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label={t(`focus.${view}` as never)}
        >
          <option value="">{t("focus.pick")}</option>
          {picker.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </div>
  );
}
