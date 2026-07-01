"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarDays,
  FolderKanban,
  Users,
  Users2,
  ListChecks,
  FileUp,
  BarChart3,
  Rocket,
  Database,
  Building2,
  Tags,
  Zap,
  FileStack,
  Map,
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
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import type { TKey } from "@/lib/i18n";
import type { Locale } from "@/lib/enums";
import { can, roleLabelKey } from "@/lib/roles";

type NavItem = {
  href: string;
  label: TKey;
  icon: React.ElementType;
  tour?: string;
};

const MAIN: NavItem[] = [
  { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/board", label: "nav.board", icon: KanbanSquare, tour: "nav-board" },
  { href: "/views", label: "nav.views", icon: CalendarDays },
  { href: "/roadmap", label: "nav.roadmap", icon: Map },
  { href: "/projects", label: "nav.projects", icon: FolderKanban },
];

const ADMIN: NavItem[] = [
  { href: "/admin/users", label: "nav.admin.users", icon: Users, tour: "nav-users" },
  { href: "/admin/teams", label: "nav.admin.teams", icon: Users2, tour: "nav-teams" },
  { href: "/admin/tasks", label: "nav.admin.tasks", icon: ListChecks },
  { href: "/sprints", label: "nav.sprints", icon: Rocket },
  { href: "/reports", label: "nav.reports", icon: BarChart3 },
  { href: "/admin/custom-fields", label: "nav.customFields", icon: Tags },
  { href: "/admin/automation", label: "nav.automation", icon: Zap },
  { href: "/admin/templates", label: "nav.templates", icon: FileStack },
  { href: "/admin/import", label: "nav.admin.import", icon: FileUp },
];

const SUPER: NavItem[] = [
  { href: "/admin/tenants", label: "nav.tenants", icon: Building2 },
  { href: "/admin/db", label: "nav.db", icon: Database },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const { t } = useT();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      data-tour={item.tour}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        active
          ? "bg-gradient-to-r from-indigo-500/15 to-emerald-500/10 text-indigo-700"
          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-pink-500" />
      )}
      <Icon className={cn("h-5 w-5", active && "text-indigo-600")} />
      {t(item.label)}
    </Link>
  );
}

type TenantInfo = { slug: string; name: string; primaryColor: string | null };

export function AppShell({
  user,
  locale,
  tenant,
  tenants,
  children,
}: {
  user: SessionUser;
  locale: Locale;
  tenant: TenantInfo;
  tenants: TenantInfo[];
  children: React.ReactNode;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === "Admin" || user.role === "SuperAdmin";
  const adminItems = [...ADMIN, ...(can(user.role, "useDbConsole") ? SUPER : [])];
  const allItems = [...MAIN, ...(isAdmin ? adminItems : [])];
  const activeItem = allItems.find((i) => isActive(pathname, i.href));

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        data-tour="sidebar"
        className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e bg-card/60 backdrop-blur md:flex"
      >
        <Link href="/" className="flex items-center px-5 py-4">
          <Logo size={30} withWordmark wordmark={t("app.name")} />
        </Link>

        <div className="px-3 pb-2">
          <TenantSwitcher current={tenant} tenants={tenants} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {MAIN.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}

          {isAdmin && (
            <>
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Admin
              </p>
              {adminItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}
            </>
          )}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Link href="/settings">
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-pink-500 text-xs text-white">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t(roleLabelKey(user.role))}
              </p>
            </div>
            <form action={logoutAction}>
              <Button variant="ghost" size="icon" aria-label={t("nav.logout")} title={t("nav.logout")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-h-screen flex-col md:ps-64">
        {/* Top header */}
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
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
            <Link href="/" className="flex items-center gap-2 md:hidden">
              <Logo size={24} />
              <span className="font-semibold">{t("app.name")}</span>
            </Link>

            {/* Desktop page-context title (not a heading — avoids duplicate H1) */}
            {activeItem && (
              <div className="hidden text-lg font-semibold md:block">
                {t(activeItem.label)}
              </div>
            )}
            {/* Mobile section chip */}
            {activeItem && (
              <span className="ms-1 flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground md:hidden">
                <activeItem.icon className="h-3.5 w-3.5 text-indigo-600" />
                {t(activeItem.label)}
              </span>
            )}

            <div data-tour="topbar-actions" className="ms-auto flex items-center gap-2">
              <Button asChild size="sm" className="hidden sm:flex" data-tour="new-task">
                <Link href="/tasks/new">
                  <Plus className="me-1 h-4 w-4" />
                  {t("nav.newTask")}
                </Link>
              </Button>
              <NotificationBell />
              <LocaleSwitcher current={locale} />
              <Link
                href="/settings"
                aria-label={t("nav.settings")}
                className="md:hidden"
              >
                <Avatar className="h-9 w-9 border">
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-pink-500 text-xs text-white">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </div>
          </div>

          {/* Mobile drawer */}
          {open && (
            <nav className="flex flex-col gap-1 border-t p-2 md:hidden">
              <div className="pb-1">
                <TenantSwitcher current={tenant} tenants={tenants} />
              </div>
              {allItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  onClick={() => setOpen(false)}
                />
              ))}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground"
              >
                <Settings className="h-4 w-4" />
                {t("nav.settings")}
              </Link>
              <form action={logoutAction} className="px-1 pt-1">
                <Button variant="outline" size="sm" className="w-full">
                  <LogOut className="me-1 h-4 w-4" />
                  {t("nav.logout")}
                </Button>
              </form>
            </nav>
          )}
        </header>

        <main className="flex-1 pb-20 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-background/90 py-1 backdrop-blur-md md:hidden">
        {MAIN.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors",
                active ? "text-indigo-600" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-7 items-center justify-center rounded-full px-3 transition-all",
                  active && "bg-gradient-to-r from-indigo-500/15 to-emerald-500/15"
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
          className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] text-indigo-600"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-white shadow-md">
            <Plus className="h-4 w-4" />
          </span>
        </Link>
      </nav>
    </div>
  );
}
