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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import type { TKey } from "@/lib/i18n";

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
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.admin || user.role === "Admin");

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
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

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive(pathname, item.href)
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:flex">
              <Link href="/tasks/new">
                <Plus className="mr-1 h-4 w-4" />
                {t("nav.newTask")}
              </Link>
            </Button>
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
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background/95 py-1 backdrop-blur md:hidden">
        {items.slice(0, 3).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[11px]",
                isActive(pathname, item.href)
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {t(item.label)}
            </Link>
          );
        })}
        <Link
          href="/tasks/new"
          className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] text-primary"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="h-4 w-4" />
          </div>
        </Link>
      </nav>
    </div>
  );
}
