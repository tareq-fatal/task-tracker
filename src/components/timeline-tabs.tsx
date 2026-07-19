import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared tab header for the consolidated "الجدول الزمني" (Timeline) nav entry:
 * /gantt (task bars + dependencies) and /roadmap (epic/project quarter lanes)
 * are two altitudes of the same time axis, so the nav shows ONE item and these
 * tabs switch between them.
 */
export function TimelineTabs({
  active,
  labels,
}: {
  active: "gantt" | "roadmap";
  labels: { gantt: string; roadmap: string };
}) {
  const tab = (href: string, key: "gantt" | "roadmap", label: string) => (
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
      {tab("/gantt", "gantt", labels.gantt)}
      {tab("/roadmap", "roadmap", labels.roadmap)}
    </div>
  );
}
