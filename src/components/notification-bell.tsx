"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ar, de, enUS, tr } from "date-fns/locale";
import {
  Bell,
  UserPlus,
  RefreshCw,
  MessageSquare,
  AtSign,
  Clock,
  AlertTriangle,
  ShieldCheck,
  SearchCheck,
  Repeat,
  Activity,
  Check,
  CheckCheck,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notifVisual } from "@/lib/notif-visual";
import { useT } from "@/components/i18n-provider";
import type { Locale } from "@/lib/enums";
import { TooltipHelp } from "@/components/ui/tooltip";
import { SkeletonScreen, SkeletonRows } from "@/components/skeleton";
import {
  getNotifications,
  markAllReadAction,
  markReadAction,
  deleteNotificationAction,
  type NotificationItem,
} from "@/actions/notifications";

const ICONS: Record<string, React.ElementType> = {
  "user-plus": UserPlus,
  "refresh-cw": RefreshCw,
  "message-square": MessageSquare,
  "at-sign": AtSign,
  clock: Clock,
  "alert-triangle": AlertTriangle,
  "shield-check": ShieldCheck,
  "search-check": SearchCheck,
  repeat: Repeat,
  activity: Activity,
  bell: Bell,
};

const DATE_LOCALES: Record<Locale, typeof ar> = { ar, de, en: enUS, tr };
const SWIPE_THRESHOLD = 72;

export function NotificationBell() {
  const { t, locale } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  // TOF-0789 (Tarek 29.10.2026): until the first fetch lands, show skeleton
  // rows instead of the misleading "no notifications" text.
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dateLocale = DATE_LOCALES[locale];

  async function refresh() {
    const data = await getNotifications();
    setItems(data.items);
    setUnread(data.unread);
    setLoaded(true);
  }

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
  }, []);

  // close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) refresh(); // freshest list on open — but DON'T auto-mark-read
  }

  async function markAll() {
    if (unread === 0) return;
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    await markAllReadAction();
  }

  function readOne(n: NotificationItem) {
    if (n.read) return;
    setUnread((u) => Math.max(0, u - 1));
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    markReadAction(n.id);
  }

  function removeOne(n: NotificationItem) {
    setItems((xs) => xs.filter((x) => x.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
    deleteNotificationAction(n.id);
  }

  function openOne(n: NotificationItem) {
    readOne(n);
    setOpen(false);
    if (n.url) router.push(n.url);
  }

  const hasUnread = unread > 0;

  return (
    <div ref={ref} className="relative">
      <TooltipHelp textKey="tooltip.notifications" disabled={open}>
        <button
          onClick={toggle}
          aria-label={t("notif.title")}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </TooltipHelp>

      {open && (
        <div className="glass absolute end-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/40 shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">{t("notif.title")}</span>
            {hasUnread ? (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("notif.markAllRead")}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{t("notif.allRead")}</span>
            )}
          </div>
          <div className="max-h-[26rem] overflow-y-auto overscroll-contain py-1">
            {!loaded ? (
              <SkeletonScreen label={t("common.loading")}>
                <SkeletonRows rows={3} />
              </SkeletonScreen>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t("notif.empty")}
              </p>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  dateLocale={dateLocale}
                  onOpen={openOne}
                  onRead={readOne}
                  onDelete={removeOne}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Ripple = { id: number; x: number; y: number };

function NotificationRow({
  n,
  dateLocale,
  onOpen,
  onRead,
  onDelete,
}: {
  n: NotificationItem;
  dateLocale: typeof ar;
  onOpen: (n: NotificationItem) => void;
  onRead: (n: NotificationItem) => void;
  onDelete: (n: NotificationItem) => void;
}) {
  const [dx, setDx] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    axis: "h" | "v" | null;
    swiped: boolean;
  } | null>(null);

  const visual = notifVisual(n.type);
  const Icon = ICONS[visual.icon] ?? Bell;

  const when = (() => {
    try {
      return formatDistanceToNowStrict(new Date(n.createdAt), { locale: dateLocale });
    } catch {
      return "";
    }
  })();

  function spawnRipple(el: HTMLElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples((rs) => [...rs, { id, x: clientX - rect.left, y: clientY - rect.top }]);
    window.setTimeout(() => setRipples((rs) => rs.filter((r) => r.id !== id)), 520);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, axis: null, swiped: false };
    spawnRipple(e.currentTarget, e.clientX, e.clientY);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const ddx = e.clientX - d.startX;
    const ddy = e.clientY - d.startY;
    if (d.axis === null) {
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
      d.axis = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
      if (d.axis === "h") e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.axis === "h") {
      d.swiped = true;
      setDx(ddx);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const ddx = dx;
    drag.current = null;
    // physical mapping: swipe right = mark read, swipe left = delete
    if (ddx > SWIPE_THRESHOLD) {
      onRead(n);
      setDx(0);
    } else if (ddx < -SWIPE_THRESHOLD) {
      setDx(-480);
      window.setTimeout(() => onDelete(n), 170);
    } else {
      setDx(0);
    }
  }

  function onClick() {
    if (drag.current?.swiped) return;
    onOpen(n);
  }

  const readHint = dx > 8;
  const deleteHint = dx < -8;

  return (
    <div className="relative select-none">
      {/* swipe reveal backgrounds (physical left = read, right = delete) */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-between px-5 transition-opacity",
          dx === 0 && "opacity-0"
        )}
      >
        <span className={cn("flex items-center gap-1 text-xs font-medium text-emerald-600", !readHint && "opacity-0")}>
          <Check className="h-4 w-4" />
        </span>
        <span className={cn("flex items-center gap-1 text-xs font-medium text-red-600", !deleteHint && "opacity-0")}>
          <Trash2 className="h-4 w-4" />
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(n);
          }
        }}
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        className={cn(
          "group relative flex cursor-pointer items-start gap-3 overflow-hidden bg-background px-3 py-3 outline-none transition-colors focus-visible:bg-secondary/60",
          dx === 0 && "duration-200",
          !n.read ? "bg-indigo-50/50 dark:bg-indigo-500/5" : "hover:bg-secondary/50"
        )}
      >
        {/* coloured icon chip */}
        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white", visual.circle)}>
          <Icon className="h-4 w-4" />
        </span>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={cn("truncate text-sm", n.read ? "font-medium" : "font-semibold")}>
              {n.title}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{when}</span>
          </div>
          {n.body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
          )}
        </div>

        {/* unread dot */}
        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}

        {/* desktop hover actions (swipe is the touch equivalent) */}
        <div className="absolute end-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 md:group-hover:flex">
          {!n.read && (
            <button
              type="button"
              aria-label="mark read"
              onClick={(e) => {
                e.stopPropagation();
                onRead(n);
              }}
              className="grid h-7 w-7 place-items-center rounded-full bg-background/90 text-emerald-600 shadow ring-1 ring-black/5 hover:bg-emerald-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label="delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(n);
            }}
            className="grid h-7 w-7 place-items-center rounded-full bg-background/90 text-red-600 shadow ring-1 ring-black/5 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* tap ripples */}
        {ripples.map((r) => (
          <span
            key={r.id}
            className="notif-ripple text-foreground/20"
            style={{ left: r.x, top: r.y, width: 12, height: 12, marginLeft: -6, marginTop: -6 }}
          />
        ))}
      </div>
    </div>
  );
}
