import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * Mobile-simplify 2026-08: Material-style FAB replacing the header "+" on
 * phones. Sits above the bottom tab bar; hidden from md up (desktop keeps
 * the header button). Server component — label comes pre-translated.
 */
export function MobileFab({ label }: { label: string }) {
  return (
    <Link
      href="/tasks/new"
      aria-label={label}
      className="fixed bottom-20 end-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-from))] to-[hsl(var(--brand-to))] text-[hsl(var(--brand-foreground))] shadow-lg shadow-[hsl(var(--brand-from)/0.4)] transition-transform active:scale-95 md:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <Plus className="h-7 w-7" />
    </Link>
  );
}
