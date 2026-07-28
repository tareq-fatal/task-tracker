"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { switchTenantAction } from "@/actions/tenant";
import { useT } from "@/components/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type T = { slug: string; name: string; primaryColor: string | null };

export function TenantSwitcher({
  current,
  tenants,
}: {
  current: T;
  tenants: T[];
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const canSwitch = tenants.length > 1;

  const dot = (color: string | null) => (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "#4f46e5" }}
    />
  );

  if (!canSwitch) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
        {dot(current.primaryColor)}
        <span className="truncate">{current.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={pending}
          title={t("tenant.switch")}
          className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary/60"
        >
          {dot(current.primaryColor)}
          <span className="flex-1 truncate text-start">{current.name}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          {t("tenant.label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((t) => (
          <DropdownMenuItem
            key={t.slug}
            className="gap-2"
            onClick={() =>
              startTransition(() => {
                switchTenantAction(t.slug);
              })
            }
          >
            {dot(t.primaryColor)}
            <span className="flex-1 truncate">{t.name}</span>
            {t.slug === current.slug && (
              <Check className="h-4 w-4 text-indigo-600" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
