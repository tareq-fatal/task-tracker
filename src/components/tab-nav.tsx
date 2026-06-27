"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type Tab = { href: string; label: string; icon?: React.ElementType };

export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
              active
                ? "bg-gradient-to-r from-indigo-500 to-pink-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
