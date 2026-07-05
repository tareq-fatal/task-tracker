"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  UserPlus,
  RefreshCw,
  MessageSquare,
  AtSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Repeat,
  Activity,
  CheckCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import {
  getNotifications,
  markAllReadAction,
  markReadAction,
  type NotificationItem,
} from "@/actions/notifications";

const PANEL_LIMIT = 20;

const ICONS: Record<string, LucideIcon> = {
  assigned: UserPlus,
  status: RefreshCw,
  comment: MessageSquare,
  mention: AtSign,
  due_soon: Clock,
  overdue: AlertTriangle,
  blocker_resolved: CheckCircle2,
  recurring: Repeat,
  admin_activity: Activity,
};

export function NotificationBell() {
  const { t, locale } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const data = await getNotifications(PANEL_LIMIT);
    setItems(data.items);
    setUnread(data.unread);
  }, []);

  // #10 — near-realtime: 30s poll + instant catch-up on tab focus / re-visibility
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const relTime = useRelativeTime(locale);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) refresh(); // show the freshest list on open — but DON'T mark read
  }

  // Click an item: mark just that one read (optimistic), then navigate if it links out.
  function openItem(n: NotificationItem) {
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markReadAction(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.url) router.push(n.url);
  }

  // Explicit "mark all as read" — the whole feed, optimistic.
  async function markAll() {
    if (unread === 0) return;
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markAllReadAction().catch(() => {});
  }

  const hasUnread = unread > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={t("notif.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {hasUnread && (
          <span
            aria-live="polite"
            className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 px-1 text-[10px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="glass absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/40 shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">{t("notif.title")}</span>
            {hasUnread ? (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("notif.markAllRead")}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{t("notif.allRead")}</span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("notif.empty")}
              </p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    role="menuitem"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b px-4 py-3 text-start text-sm transition-colors hover:bg-secondary/60",
                      !n.read && "bg-indigo-50/60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                        n.read
                          ? "bg-secondary text-muted-foreground"
                          : "bg-indigo-100 text-indigo-600"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{n.title}</span>
                        {!n.read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                        )}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {relTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Locale-aware relative timestamp ("5 min ago"), no extra i18n keys needed. */
function useRelativeTime(locale: string) {
  const rtf = useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
    [locale]
  );
  return useCallback(
    (iso: string) => {
      const diffMs = new Date(iso).getTime() - Date.now();
      const sec = Math.round(diffMs / 1000);
      const abs = Math.abs(sec);
      if (abs < 60) return rtf.format(sec, "second");
      const min = Math.round(sec / 60);
      if (Math.abs(min) < 60) return rtf.format(min, "minute");
      const hr = Math.round(min / 60);
      if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
      const day = Math.round(hr / 24);
      if (Math.abs(day) < 30) return rtf.format(day, "day");
      const mon = Math.round(day / 30);
      if (Math.abs(mon) < 12) return rtf.format(mon, "month");
      return rtf.format(Math.round(mon / 12), "year");
    },
    [rtf]
  );
}
