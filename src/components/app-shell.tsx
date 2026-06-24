"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  FolderKanban,
  Users,
  ListChecks,
  Settings,
  LogOut,
  Plus,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tasks";
import { useT } from "@/components/i18n-provider";
import { logoutAction } from "@/actions/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import type { TKey } from "@/lib/i18n";
import type { Locale } from "@/lib/enums";

type NavItem = { href: string; label: TKey; icon: React.ElementType; admin?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/board", label: "nav.board", icon: KanbanSquare },
  { href: "/projects", label: "nav.projects", icon: FolderKanban },
  { href: "/admin/users", label: "nav.admin.users", icon: Users, admin: true },
  { href: "/admin/tasks", label: "nav.admin.tasks", icon: ListChecks, admin: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  user,
  locale,
  children,
}: {
  user: SessionUser;
  locale: Locale;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.admin || user.role === "Admin");
  const activeItem = items.find((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-14 items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X /> : <Menu />}
          </Button>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={28} height={28} />
            <span className="font-semibold">{t("app.name")}</span>
          </Link>

          {/* Mobile: active section indicator */}
          {activeItem && (
            <span className="ms-1 flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground md:hidden">
              <activeItem.icon className="h-3.5 w-3.5 text-sky-600" />
              {t(activeItem.label)}
            </span>
          )}

          <nav className="ms-6 hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-gradient-to-r from-sky-500/15 to-teal-500/15 text-sky-700"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-sky-600")} />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:flex">
              <Link href="/tasks/new">
                <Plus className="me-1 h-4 w-4" />
                {t("nav.newTask")}
              </Link>
            </Button>
            <LocaleSwitcher current={locale} />
            <Link href="/settings" aria-label={t("nav.settings")}>
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Link>
            <form action={logoutAction}>
              <Button variant="ghost" size="icon" aria-label={t("nav.logout")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Mobile dropdown nav */}
        {open && (
          <nav className="flex flex-col gap-1 border-t p-2 md:hidden">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                    isActive(pathname, item.href)
                      ? "bg-secondary"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.label)}
                </Link>
              );
            })}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground"
            >
              <Settings className="h-4 w-4" />
              {t("nav.settings")}
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1 pb-20 md:pb-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-background/90 py-1 backdrop-blur-md md:hidden">
        {items.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors",
                active ? "text-sky-600" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-7 items-center justify-center rounded-full px-3 transition-all",
                  active && "bg-gradient-to-r from-sky-500/15 to-teal-500/15"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {t(item.label)}
            </Link>
          );
        })}
        <Link
          href="/tasks/new"
          className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] text-sky-600"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md">
            <Plus className="h-4 w-4" />
          </span>
        </Link>
      </nav>
    </div>
  );
}
