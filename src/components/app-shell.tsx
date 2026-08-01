"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarDays,
  FolderKanban,
  Users,
  Users2,
  ListChecks,
  FileUp,
  FileSpreadsheet,
  BarChart3,
  Rocket,
  Database,
  Building2,
  Tags,
  Zap,
  Webhook,
  FileStack,
  GanttChartSquare,
  Send,
  BellRing,
  Target,
  Table2,
  Palette,
  Plug,
  Activity,
  Repeat,
  Clock,
  Timer,
  Settings,
  LogOut,
  Plus,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tasks";
import { useT } from "@/components/i18n-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ScrollProgress } from "@/components/scroll-progress";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { GlobalSearch } from "@/components/global-search";
import { RunningTimer } from "@/components/running-timer";
import { AppEnvironmentBanner } from "@/components/app-environment-banner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth";
import type { TKey } from "@/lib/i18n";
import { isAdminRole, isSubAdmin } from "@/lib/enums";
import type { Locale } from "@/lib/enums";
import { can, roleLabelKey } from "@/lib/roles";

type NavItem = {
  href: string;
  label: TKey;
  icon: React.ElementType;
  tour?: string;
  adminOnly?: boolean;
  tip?: TKey;
  /** Extra path prefixes that also count as "this item is active". */
  match?: string[];
};

// 4 distinct task views (Board=Kanban flow, List=dense table, Calendar,
// Timeline=Gantt+Roadmap under one roof) — /roadmap is reachable via the
// Timeline tabs, not a separate nav entry.
const MAIN: NavItem[] = [
  { href: "/", label: "nav.dashboard", icon: LayoutDashboard, tip: "tooltip.dashboard" },
  { href: "/board", label: "nav.board", icon: KanbanSquare, tour: "nav-board", tip: "tooltip.board" },
  { href: "/tasks", label: "nav.focus", icon: Target, adminOnly: true, tip: "tooltip.focus" },
  { href: "/list", label: "nav.list", icon: Table2, tip: "tooltip.list" },
  { href: "/views", label: "nav.views", icon: CalendarDays, tip: "tooltip.views" },
  { href: "/gantt", label: "nav.timeline", icon: GanttChartSquare, match: ["/roadmap"] },
  { href: "/time", label: "nav.time", icon: Clock },
  { href: "/projects", label: "nav.projects", icon: FolderKanban, tip: "tooltip.projects" },
];

// Mobile bottom nav = the 4 everyday views; everything else lives in "More".
const MOBILE_PRIMARY = ["/", "/board", "/list", "/views"];

const ADMIN: NavItem[] = [
  { href: "/admin/users", label: "nav.admin.users", icon: Users, tour: "nav-users" },
  { href: "/admin/teams", label: "nav.admin.teams", icon: Users2, tour: "nav-teams" },
  { href: "/admin/tasks", label: "nav.admin.tasks", icon: ListChecks },
  { href: "/admin/activity", label: "nav.activity", icon: Activity },
  { href: "/admin/notifications", label: "nav.adminNotifications", icon: BellRing },
  { href: "/admin/telegram", label: "nav.telegramAdmin", icon: Send },
  { href: "/sprints", label: "nav.sprints", icon: Rocket, tip: "tooltip.sprints" },
  // Kunden-Report 2026-08, Bug 3: "Berichte" + "Einblicke" merged into ONE
  // entry — /reports carries tabs now; /reports/insights redirects there.
  { href: "/reports", label: "nav.reports", icon: BarChart3, tip: "tooltip.reports", match: ["/reports/insights"] },
  { href: "/reports/time", label: "nav.timeReports", icon: Timer },
  { href: "/admin/custom-fields", label: "nav.customFields", icon: Tags },
  { href: "/admin/automation", label: "nav.automation", icon: Zap },
  { href: "/admin/webhooks", label: "nav.webhooks", icon: Webhook },
  { href: "/admin/templates", label: "nav.templates", icon: FileStack },
  { href: "/admin/recurring", label: "nav.admin.recurring", icon: Repeat },
  { href: "/settings/branding", label: "nav.branding", icon: Palette },
  { href: "/settings/integrations", label: "nav.integrations", icon: Plug },
  { href: "/admin/import", label: "nav.admin.import", icon: FileUp },
  { href: "/admin/bulk-import", label: "nav.admin.bulkImport", icon: FileSpreadsheet },
];

const SUPER: NavItem[] = [
  { href: "/admin/mandanten", label: "nav.tenants", icon: Building2 },
  { href: "/admin/db", label: "nav.db", icon: Database },
];

function isActive(pathname: string, href: string, match?: string[]) {
  if (href === "/") return pathname === "/";
  const hit = (h: string) => pathname === h || pathname.startsWith(h + "/");
  return hit(href) || (match ?? []).some(hit);
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
  const link = (
    <Link
      href={item.href}
      onClick={onClick}
      data-tour={item.tour}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        active
          ? "bg-gradient-to-r from-[hsl(var(--brand-from)/0.15)] to-[hsl(var(--brand-to)/0.10)] text-[hsl(var(--primary))]"
          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-gradient-to-b from-[hsl(var(--brand-from))] to-[hsl(var(--brand-to))]" />
      )}
      <Icon className={cn("h-5 w-5", active && "text-[hsl(var(--primary))]")} />
      {t(item.label)}
    </Link>
  );
  return item.tip ? (
    <TooltipHelp textKey={item.tip} side="right">
      {link}
    </TooltipHelp>
  ) : (
    link
  );
}

type TenantInfo = { slug: string; name: string; primaryColor: string | null; logo?: string | null };

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
  // Mobile "More" bottom sheet — the ONLY secondary nav on mobile (the old
  // hamburger drawer duplicated the bottom nav and is gone).
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = isAdminRole(user.role);
  const isBackend = can(user.role, "useDbConsole"); // BackendAdmin (Tarek) only
  // Focus (/tasks) is admin-only — hide it from regular users' nav.
  const mainNav = isAdmin ? MAIN : MAIN.filter((i) => !i.adminOnly);
  // SubAdmin: no admin section, but the user-management page (their job).
  const subAdminNav = !isAdmin && isSubAdmin(user.role)
    ? ADMIN.filter((i) => i.href === "/admin/users")
    : [];
  const allItems = [...mainNav, ...(isBackend ? SUPER : []), ...(isAdmin ? ADMIN : []), ...subAdminNav];
  const activeItem = allItems.find((i) => isActive(pathname, i.href, i.match));

  // Bottom nav: the 4 everyday views; the rest goes into the More sheet.
  const bottomNav = mainNav.filter((i) => MOBILE_PRIMARY.includes(i.href));
  const moreNav = mainNav.filter((i) => !MOBILE_PRIMARY.includes(i.href));
  const moreActive = moreNav.some((i) => isActive(pathname, i.href, i.match)) ||
    [...(isBackend ? SUPER : []), ...(isAdmin ? ADMIN : [])].some((i) => isActive(pathname, i.href)) ||
    isActive(pathname, "/settings");

  // Close the sheet on navigation.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Lock background scroll while the More sheet is open, preserving position
  // (fixes the "opening the menu jumps to top" bug in the APK).
  useEffect(() => {
    if (!moreOpen) return;
    const y = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    return () => {
      body.style.position = "";
      body.style.top = "";
      body.style.width = "";
      window.scrollTo(0, y);
    };
  }, [moreOpen]);

  return (
    <div className="min-h-screen">
      <ScrollProgress />
      <KeyboardShortcuts isAdmin={isAdmin} />
      {/* Desktop sidebar */}
      <aside
        data-tour="sidebar"
        className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e bg-card/60 backdrop-blur md:flex"
      >
        <Link href="/" className="flex items-center px-5 py-4">
          {tenant.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo} alt={tenant.name} className="h-8 max-w-[180px] object-contain" />
          ) : (
            <Logo size={30} withWordmark wordmark={t("app.name")} />
          )}
        </Link>

        <div className="px-3 pb-2">
          <TenantSwitcher current={tenant} tenants={tenants} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {mainNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href, item.match)}
            />
          ))}

          {isBackend && (
            <>
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-indigo-500/80">
                🛠️ {t("nav.backendSection")}
              </p>
              {SUPER.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href, item.match)} />
              ))}
            </>
          )}

          {isAdmin && (
            <>
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {t("nav.adminSection")}
              </p>
              {ADMIN.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href, item.match)} />
              ))}
            </>
          )}

          {subAdminNav.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {t("nav.adminSection")}
              </p>
              {subAdminNav.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href, item.match)} />
              ))}
            </>
          )}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Link href="/settings">
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--brand-from))] to-[hsl(var(--brand-to))] text-xs text-[hsl(var(--brand-foreground))]">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm font-medium">
                {isBackend ? <span title={t("role.backend")}>🛠️</span> : isAdmin ? <span title={t("role.admin")}>👑</span> : null}
                <span className="truncate">{user.name}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t(roleLabelKey(user.role))}
              </p>
            </div>
            <TooltipHelp textKey="tooltip.logout">
              <Button asChild variant="ghost" size="icon" aria-label={t("nav.logout")}>
                <a href="/logout"><LogOut className="h-4 w-4" /></a>
              </Button>
            </TooltipHelp>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-h-screen flex-col md:ps-64">
        {/* Top header */}
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 md:hidden">
              {/* Kunden-Report 2026-08, Bug 5: the tenant logo only lived in
                  the md:flex sidebar — phones showed the generic mark. Mirror
                  the sidebar's ternary here, capped so the section chip and
                  the action cluster keep their room. */}
              {tenant.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logo} alt={tenant.name} className="h-6 max-w-[110px] object-contain" />
              ) : (
                <>
                  <Logo size={24} />
                  <span className="font-semibold">{t("app.name")}</span>
                </>
              )}
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
                <activeItem.icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                {t(activeItem.label)}
              </span>
            )}

            <div data-tour="topbar-actions" className="ms-auto flex items-center gap-2">
              <GlobalSearch userId={user.id} tenantSlug={tenant.slug} />
              <RunningTimer />
              <TooltipHelp textKey="tooltip.new_task">
                <Button asChild size="sm" data-tour="new-task" aria-label={t("nav.newTask")}>
                  <Link href="/tasks/new">
                    <Plus className="h-4 w-4 sm:me-1" />
                    <span className="hidden sm:inline">{t("nav.newTask")}</span>
                  </Link>
                </Button>
              </TooltipHelp>
              <NotificationBell />
              <LocaleSwitcher current={locale} />
              <TooltipHelp textKey="tooltip.profile">
                <Link
                  href="/settings"
                  aria-label={t("nav.settings")}
                  className="md:hidden"
                >
                  <Avatar className="h-9 w-9 border">
                    <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--brand-from))] to-[hsl(var(--brand-to))] text-xs text-[hsl(var(--brand-foreground))]">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </TooltipHelp>
            </div>
          </div>

        </header>

        {/* Mobile bottom padding must clear the fixed bottom nav (~4.5rem incl.
            labels) with breathing room, or the last buttons on long pages
            (comment send, voice note) sit under the nav. */}
        <main className="flex-1 pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-8">
          <AppEnvironmentBanner />
          {user.mustChangePassword && (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              {t("account.mustChangePassword")}{" "}
              <Link href="/settings" className="font-semibold underline underline-offset-2">
                {t("account.changeNow")}
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile "More" bottom sheet — everything that is not in the 4-item
          bottom nav: remaining views, admin/backend sections, settings, logout. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label={t("nav.close")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t bg-background p-3 shadow-2xl"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <div className="mb-2 flex items-center justify-between px-1">
              <TenantSwitcher current={tenant} tenants={tenants} />
              <button
                onClick={() => setMoreOpen(false)}
                aria-label={t("nav.close")}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {moreNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href, item.match)}
                  onClick={() => setMoreOpen(false)}
                />
              ))}
              {isBackend && (
                <>
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-500/80">
                    🛠️ {t("nav.backendSection")}
                  </p>
                  {SUPER.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={() => setMoreOpen(false)} />
                  ))}
                </>
              )}
              {isAdmin && (
                <>
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {t("nav.adminSection")}
                  </p>
                  {ADMIN.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={() => setMoreOpen(false)} />
                  ))}
                </>
              )}
              {subAdminNav.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {t("nav.adminSection")}
                  </p>
                  {subAdminNav.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={() => setMoreOpen(false)} />
                  ))}
                </>
              )}
              <Link
                href="/settings"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground"
              >
                <Settings className="h-5 w-5" />
                {t("nav.settings")}
              </Link>
              <Button asChild variant="outline" size="sm" className="mx-1 mt-1 w-[calc(100%-0.5rem)]">
                <a href="/logout">
                  <LogOut className="me-1 h-4 w-4" />
                  {t("nav.logout")}
                </a>
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Mobile bottom nav — the ONLY mobile navigation: 4 everyday views plus
          "More". pb includes the device safe-area so icons aren't hidden behind
          the Android/iOS system bar inside the APK. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-background/90 pt-1 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom))" }}
      >
        {bottomNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors",
                active ? "text-[hsl(var(--primary))]" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-7 items-center justify-center rounded-full px-3 transition-all",
                  active && "bg-gradient-to-r from-[hsl(var(--brand-from)/0.15)] to-[hsl(var(--brand-to)/0.15)]"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {t(item.label)}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors",
            moreOpen || moreActive ? "text-[hsl(var(--primary))]" : "text-muted-foreground"
          )}
          aria-label={t("nav.more")}
          aria-expanded={moreOpen}
        >
          <span
            className={cn(
              "flex h-7 items-center justify-center rounded-full px-3 transition-all",
              (moreOpen || moreActive) && "bg-gradient-to-r from-[hsl(var(--brand-from)/0.15)] to-[hsl(var(--brand-to)/0.15)]"
            )}
          >
            <Menu className="h-5 w-5" />
          </span>
          {t("nav.more")}
        </button>
      </nav>
    </div>
  );
}
