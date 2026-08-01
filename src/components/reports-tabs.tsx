import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tab header for the consolidated "Berichte" nav entry (Kunden-Report 2026-08,
 * Bug 3): /reports (dashboard) and /reports?tab=insights (forecasts) used to
 * be two separate menu items — the nav now shows ONE item and these tabs
 * switch between the two views. Modeled on TimelineTabs (gantt/roadmap).
 */
export function ReportsTabs({
  active,
  labels,
}: {
  active: "reports" | "insights";
  labels: { reports: string; insights: string };
}) {
  const tab = (href: string, key: "reports" | "insights", label: string) => (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium transition-colors",
        active === key
          ? "bg-indigo-100 text-indigo-700"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex items-center gap-2">
      {tab("/reports", "reports", labels.reports)}
      {tab("/reports?tab=insights", "insights", labels.insights)}
    </div>
  );
}
