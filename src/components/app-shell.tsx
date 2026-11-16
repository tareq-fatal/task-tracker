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
  ListTodo,
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
  Gauge,
  BookOpen,
  KeyRound,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tasks";
import { useT } from "@/components/i18n-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeQuickToggle } from "@/components/theme-toggle";
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
  /** TOF-0962: Gruppe in der Seitenleiste. */
  section?: "work" | "plan" | "knowledge";
};

// 4 distinct task views (Board=Kanban flow, List=dense table, Calendar,
// Timeline=Gantt+Roadmap under one roof) — /roadmap is reachable via the
// Timeline tabs, not a separate nav entry.
const MAIN: NavItem[] = [
  { href: "/", label: "nav.dashboard", icon: LayoutDashboard, tip: "tooltip.dashboard", section: "work" },
  // Einstieg für den Alltag: höchstens 10 Aufgaben statt der vollen Liste.
  { href: "/next", label: "nav.next", icon: ListTodo, section: "work" },
  { href: "/board", label: "nav.board", icon: KanbanSquare, tour: "nav-board", tip: "tooltip.board", section: "work" },
  { href: "/tasks", label: "nav.focus", icon: Target, adminOnly: true, tip: "tooltip.focus", section: "work" },
  { href: "/list", label: "nav.list", icon: Table2, tip: "tooltip.list", section: "work" },
  { href: "/views", label: "nav.views", icon: CalendarDays, tip: "tooltip.views", section: "plan" },
  { href: "/gantt", label: "nav.timeline", icon: GanttChartSquare, match: ["/roadmap"], section: "plan" },
  { href: "/time", label: "nav.time", icon: Clock, section: "plan" },
  { href: "/projects", label: "nav.projects", icon: FolderKanban, tip: "tooltip.projects", section: "knowledge" },
  { href: "/projektstand", label: "nav.projektstand", icon: Gauge, tip: "tooltip.projektstand", section: "knowledge" },
  { href: "/wissen", label: "wissen.title", icon: BookOpen, section: "knowledge" }, // TOF-0839 Projekt-Wissen
];

// Mobile bottom nav = the 4 everyday views; everything else lives in "More".
const MOBILE_PRIMARY = ["/", "/next", "/board", "/list"];

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
  { href: "/settings/kontext-token", label: "kontext.tokens", icon: KeyRound },
  { href: "/admin/import", label: "nav.admin.import", icon: FileUp },
  { href: "/admin/bulk-import", label: "nav.admin.bulkImport", icon: FileSpreadsheet },
];

const SUPER: NavItem[] = [
  { href: "/admin/mandanten", label: "nav.tenants", icon: Building2 },
  { href: "/admin/db", label: "nav.db", icon: Database },
];

function isActive(pathname: string, href: string, match?: string[]) {
  if (href === "/") return pathname === "/";
  // /tasks = Fokus-Ansicht; /tasks/<id> ist eine Aufgabe, nicht „Fokus“.
  if (href === "/tasks") return pathname === "/tasks";
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors coarse:h-11",
        active
          ? "bg-primary-soft text-primary-soft-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary-soft-foreground" : "opacity-80")} />
      <span className="truncate">{t(item.label)}</span>
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


/** TOF-0962: ruhige Abschnittsüberschrift in der Seitenleiste. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/** Einklappbarer Bereich (Admin/Backend) — offen, wenn eine Seite darin aktiv ist. */
function CollapsibleSection({
  label,
  items,
  pathname,
  onNavigate,
  storageKey,
  defaultOpen = false,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  storageKey: string;
  /** Ohne gespeicherte Wahl offen (z. B. Backend: nur 2 Einträge). */
  defaultOpen?: boolean;
}) {
  const containsActive = items.some((i) => isActive(pathname, i.href, i.match));
  const [open, setOpen] = useState(containsActive || defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
      else if (v === "0" && !containsActive) setOpen(false);
    } catch {
      /* best effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      /* best effort */
    }
  }
  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground coarse:h-11"
      >
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href, item.match)} onClick={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      <AvatarFallback className="bg-primary-soft text-[11px] font-semibold text-primary-soft-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
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

  const sections: { key: NonNullable<NavItem["section"]>; label: TKey }[] = [
    { key: "work", label: "ui.section.work" as TKey },
    { key: "plan", label: "ui.section.plan" as TKey },
    { key: "knowledge", label: "ui.section.knowledge" as TKey },
  ];
  const openSearch = () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));

  return (
    <div className="min-h-screen">
      <ScrollProgress />
      <KeyboardShortcuts isAdmin={isAdmin} />
      {/* Desktop-Seitenleiste (TOF-0962: ruhig, gruppiert, Admin einklappbar) */}
      <aside
        data-tour="sidebar"
        className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e bg-card md:flex"
      >
        <Link href="/" className="flex h-14 shrink-0 items-center px-4">
          {tenant.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo} alt={tenant.name} className="h-7 max-w-[170px] object-contain" />
          ) : (
            <Logo size={26} withWordmark wordmark={t("app.name")} />
          )}
        </Link>

        <div className="px-3 pb-1">
          <TenantSwitcher current={tenant} tenants={tenants} role={user.role} />
        </div>

        <nav className="thin-scroll flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((sec) => {
            const items = mainNav.filter((i) => (i.section ?? "work") === sec.key);
            if (items.length === 0) return null;
            return (
              <div key={sec.key}>
                <SectionLabel>{t(sec.label)}</SectionLabel>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(pathname, item.href, item.match)} />
                  ))}
                </div>
              </div>
            );
          })}

          {isAdmin && (
            <CollapsibleSection label={t("nav.adminSection")} items={ADMIN} pathname={pathname} storageKey="tt.nav.admin" />
          )}
          {subAdminNav.length > 0 && (
            <CollapsibleSection label={t("nav.adminSection")} items={subAdminNav} pathname={pathname} storageKey="tt.nav.subadmin" />
          )}
          {isBackend && (
            <CollapsibleSection label={t("nav.backendSection")} items={SUPER} pathname={pathname} storageKey="tt.nav.backend" defaultOpen />
          )}
        </nav>

        <div className="border-t p-2">
          <div className="flex items-center gap-1 rounded-lg px-1 py-1">
            <Link
              href="/settings"
              aria-label={t("nav.settings")}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-accent"
            >
              <UserAvatar name={user.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t(roleLabelKey(user.role))}</span>
              </span>
            </Link>
            <TooltipHelp textKey="tooltip.logout">
              <Button asChild variant="ghost" size="icon" aria-label={t("nav.logout")} className="text-muted-foreground">
                <a href="/logout"><LogOut className="h-4 w-4" /></a>
              </Button>
            </TooltipHelp>
          </div>
        </div>
      </aside>

      {/* Inhaltsspalte */}
      <div className="flex min-h-screen flex-col md:ps-60">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
          <div className="flex h-14 items-center gap-1.5 px-3 sm:gap-2 sm:px-5">
            <Link href="/" className="flex shrink-0 items-center gap-2 md:hidden" aria-label={t("app.name")}>
              {/* Kunden-Report 2026-08, Bug 5: Mandanten-Logo auch auf dem Handy. */}
              {tenant.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logo} alt={tenant.name} className="h-6 max-w-[96px] object-contain" />
              ) : (
                <Logo size={26} />
              )}
            </Link>

            {/* Seitentitel (kein H1 — die Seite hat ihren eigenen) */}
            {activeItem ? (
              <div className="ms-1 flex min-w-0 items-center gap-2 text-[15px] font-semibold md:ms-0">
                <activeItem.icon className="hidden h-[18px] w-[18px] text-muted-foreground md:block" />
                <span className="truncate">{t(activeItem.label)}</span>
              </div>
            ) : pathname.startsWith("/tasks/") ? (
              <div className="ms-1 truncate text-[15px] font-semibold md:ms-0">{t("type.Task")}</div>
            ) : null}

            <div data-tour="topbar-actions" className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
              <GlobalSearch userId={user.id} tenantSlug={tenant.slug} />
              <RunningTimer />
              <TooltipHelp textKey="tooltip.new_task">
                <Button asChild size="sm" data-tour="new-task" aria-label={t("nav.newTask")} className="mx-1 px-2.5 sm:px-3">
                  <Link href="/tasks/new">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("nav.newTask")}</span>
                  </Link>
                </Button>
              </TooltipHelp>
              <NotificationBell />
              <ThemeQuickToggle className="hidden sm:inline-flex" />
              <span className="hidden sm:inline-flex">
                <LocaleSwitcher current={locale} />
              </span>
            </div>
          </div>
        </header>

        {/* Unten Platz für die feste Handy-Leiste (~4.5rem) plus Luft. */}
        <main className="flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-10">
          <AppEnvironmentBanner />
          {user.mustChangePassword && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
              {t("account.mustChangePassword")}{" "}
              <Link href="/settings" className="font-semibold underline underline-offset-2">
                {t("account.changeNow")}
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Handy: „Mehr“-Blatt mit allem, was nicht in der unteren Leiste steht. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
          <button
            aria-label={t("nav.close")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t bg-card p-3 shadow-overlay"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <div className="mb-2 flex items-center gap-2 px-1">
              <div className="min-w-0 flex-1">
                <TenantSwitcher current={tenant} tenants={tenants} role={user.role} />
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label={t("nav.close")}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setTimeout(openSearch, 50);
                }}
                className="flex h-11 flex-1 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground"
              >
                <Search className="h-4 w-4" />
                {t("search.button")}
              </button>
              <ThemeQuickToggle className="border" />
              <span className="inline-flex rounded-lg border">
                <LocaleSwitcher current={locale} />
              </span>
            </div>
            <nav className="flex flex-col gap-0.5">
              {moreNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href, item.match)}
                  onClick={() => setMoreOpen(false)}
                />
              ))}
              {isAdmin && (
                <CollapsibleSection label={t("nav.adminSection")} items={ADMIN} pathname={pathname} onNavigate={() => setMoreOpen(false)} storageKey="tt.nav.admin" />
              )}
              {subAdminNav.length > 0 && (
                <CollapsibleSection label={t("nav.adminSection")} items={subAdminNav} pathname={pathname} onNavigate={() => setMoreOpen(false)} storageKey="tt.nav.subadmin" />
              )}
              {isBackend && (
                <CollapsibleSection label={t("nav.backendSection")} items={SUPER} pathname={pathname} onNavigate={() => setMoreOpen(false)} storageKey="tt.nav.backend" defaultOpen />
              )}
              <div className="my-2 border-t" />
              <Link
                href="/settings"
                onClick={() => setMoreOpen(false)}
                className="flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-muted-foreground hover:bg-accent"
              >
                <Settings className="h-[18px] w-[18px]" />
                {t("nav.settings")}
              </Link>
              <a
                href="/logout"
                className="flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-muted-foreground hover:bg-accent"
              >
                <LogOut className="h-[18px] w-[18px]" />
                {t("nav.logout")}
              </a>
            </nav>
          </div>
        </div>
      )}

      {/* Handy-Leiste unten: 4 Alltagsansichten + „Mehr“. Jede Fläche ≥ 44 px. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t bg-card/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {bottomNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  active && "bg-primary-soft"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="max-w-full truncate">{t(item.label)}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={cn(
            "flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors",
            moreOpen || moreActive ? "text-primary" : "text-muted-foreground"
          )}
          aria-label={t("nav.more")}
          aria-expanded={moreOpen}
        >
          <span
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
              (moreOpen || moreActive) && "bg-primary-soft"
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
