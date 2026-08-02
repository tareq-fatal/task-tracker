import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Mobile-simplify 2026-08: on phones the "قائمة" tab bundles list + calendar
 * behind this pill toggle (Kanban is desktop-only there). Hidden from md up —
 * desktop keeps the separate sidebar entries.
 */
export function MobileListToggle({
  active,
  labels,
}: {
  active: "list" | "calendar";
  labels: { list: string; calendar: string };
}) {
  const pill = (href: string, key: "list" | "calendar", label: string) => (
    <Link
      href={href}
      className={cn(
        "flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors",
        active === key
          ? "bg-[hsl(var(--brand-from)/0.15)] text-[hsl(var(--primary))]"
          : "text-muted-foreground"
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-3 flex items-center gap-1 rounded-full border bg-card p-1 md:hidden">
      {pill("/list", "list", labels.list)}
      {pill("/views", "calendar", labels.calendar)}
    </div>
  );
}
