"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TOF-0962: einheitlicher Zurück-Knopf. Kommt man aus der App, geht er einen
 * Schritt zurück (Filter/Scroll bleiben erhalten); sonst zum festen Ziel.
 * Antippfläche ≥ 44 px, Pfeil spiegelt sich bei RTL.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        try {
          const ref = document.referrer ? new URL(document.referrer) : null;
          if (ref && ref.origin === window.location.origin && window.history.length > 1) {
            e.preventDefault();
            router.back();
          }
        } catch {
          /* ungültiger Referrer → normaler Link */
        }
      }}
      className={cn(
        "-ms-2 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground coarse:min-h-11",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      <span className="max-w-[60vw] truncate">{label}</span>
    </Link>
  );
}
