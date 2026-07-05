"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bell,
  UserPlus,
  ArrowLeftRight,
  MessageSquare,
  AtSign,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  Repeat,
  ShieldAlert,
  Check,
  Trash2,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import { vibrate, notifyNative } from "@/lib/native";
import { timeAgo } from "@/lib/time-ago";
import type { TKey } from "@/lib/i18n";
import {
  getNotifications,
  markAllReadAction,
  markReadAction,
  deleteNotificationAction,
  type NotificationItem,
} from "@/actions/notifications";

/* Material-3 tonal treatment per event type: a filled icon circle, matched to
   the app's palette, that stays legible in both light and dark. */
const VISUALS: Record<
  string,
  { icon: React.ElementType; circle: string }
> = {
  assigned: { icon: UserPlus, circle: "bg-indigo-500" },
  status: { icon: ArrowLeftRight, circle: "bg-sky-500" },
  comment: { icon: MessageSquare, circle: "bg-violet-500" },
  mention: { icon: AtSign, circle: "bg-fuchsia-500" },
  due_soon: { icon: Clock3, circle: "bg-amber-500" },
  overdue: { icon: AlertTriangle, circle: "bg-rose-500" },
  blocker_resolved: { icon: CheckCircle2, circle: "bg-emerald-500" },
  recurring: { icon: Repeat, circle: "bg-teal-500" },
  admin_activity: { icon: ShieldAlert, circle: "bg-slate-500" },
};
function visualFor(type: string) {
  return VISUALS[type] ?? { icon: Bell, circle: "bg-indigo-500" };
}

/* A soft two-note chime via WebAudio — no asset to bundle, and on the APK the
   LocalNotifications channel adds the real system sound on top. */
let audioCtx: AudioContext | null = null;
function playChime() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx ?? new AC();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, at] of [
      [880, 0],
      [1174.66, 0.09],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.4);
    }
  } catch {
    /* autoplay blocked / unsupported — the visual + haptic still fire */
  }
}

export function NotificationBell() {
  const { t, locale } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [bump, setBump] = useState(0); // re-triggers the badge pop animation
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null); // ids known from a prior poll

  // Portal target readiness (the mobile sheet must escape the header's
  // backdrop-filter, which otherwise becomes its containing block).
  useEffect(() => setMounted(true), []);

  const refresh = useCallback(async () => {
    const data = await getNotifications();
    if (seen.current === null) {
      // First load — seed the baseline silently (no chime for history).
      seen.current = new Set(data.items.map((i) => i.id));
    } else {
      const fresh = data.items.filter(
        (i) => !seen.current!.has(i.id) && !i.read
      );
      if (fresh.length > 0) {
        const newest = fresh[0];
        void vibrate("success");
        playChime();
        void notifyNative({
          title: newest.title,
          body: newest.body ?? undefined,
        });
        setBump((b) => b + 1);
      }
      data.items.forEach((i) => seen.current!.add(i.id));
    }
    setItems(data.items);
    setUnread(data.unread);
  }, []);

  // #10 — near-realtime: 30s poll + instant catch-up on focus / re-visibility.
  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 30000);
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Close on an outside click. The mobile sheet is portaled to <body> (outside
  // `ref`), so also treat clicks inside the panel itself as "inside".
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (ref.current?.contains(target as Node)) return;
      if (target?.closest?.("[data-notif-panel]")) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Lock body scroll while the mobile sheet is up.
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
    if (!open) void refresh();
  }

  async function markAll() {
    if (unread === 0) return;
    void vibrate("light");
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markAllReadAction();
  }

  async function onMarkRead(id: string) {
    setItems((xs) => {
      const next = xs.map((x) => (x.id === id ? { ...x, read: true } : x));
      setUnread(next.filter((x) => !x.read).length);
      return next;
    });
    await markReadAction(id);
  }

  async function onDelete(id: string) {
    setItems((xs) => {
      const next = xs.filter((x) => x.id !== id);
      setUnread(next.filter((x) => !x.read).length);
      return next;
    });
    await deleteNotificationAction(id);
  }

  function onOpenItem(n: NotificationItem) {
    void onMarkRead(n.id);
    setOpen(false);
    if (n.url) router.push(n.url);
  }

  const list = (
    <>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Bell className="h-7 w-7" />
          </span>
          <p className="text-sm text-muted-foreground">{t("notif.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2 p-3">
          {items.map((n) => (
            <NotificationCard
              key={n.id}
              n={n}
              locale={locale}
              t={t}
              onOpen={onOpenItem}
              onMarkRead={onMarkRead}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </>
  );

  const header = (
    <div className="flex items-center justify-between px-4 pb-1 pt-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight">{t("notif.title")}</h2>
        {unread > 0 && (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {unread}
          </span>
        )}
      </div>
      {unread > 0 && (
        <button
          onClick={markAll}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-500/10 dark:text-indigo-400"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {t("notif.markAllRead")}
        </button>
      )}
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={t("notif.title")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
      >
        <Bell className="h-[22px] w-[22px]" />
        {unread > 0 && (
          <span
            key={bump}
            className="tt-badge-pop absolute end-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-background"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Desktop / tablet: anchored dropdown */}
          <div className="hidden md:block">
            <div
              data-notif-panel
              className="glass absolute end-0 z-50 mt-2 w-96 overflow-hidden rounded-2xl border border-white/40 shadow-2xl dark:border-white/10"
            >
              {header}
              <div className="max-h-[26rem] overflow-y-auto">{list}</div>
            </div>
          </div>

          {/* Mobile: Material-3 bottom sheet with scrim. Portaled to <body> so
              the header's backdrop-filter can't trap the fixed positioning. */}
          {mounted &&
            createPortal(
              <div className="md:hidden">
                <div
                  className="tt-scrim-in fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
                  onClick={() => setOpen(false)}
                />
                <div
                  data-notif-panel
                  className="tt-sheet-up fixed inset-x-0 bottom-0 z-[71] max-h-[82vh] overflow-hidden rounded-t-3xl border-t border-white/10 bg-background shadow-2xl"
                  style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                >
                  <div className="flex justify-center pt-2.5">
                    <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
                  </div>
                  {header}
                  <div className="max-h-[calc(82vh-4rem)] overflow-y-auto overscroll-contain">
                    {list}
                  </div>
                </div>
              </div>,
              document.body
            )}
        </>
      )}
    </div>
  );
}

/* ── One swipeable, ripple-y notification card ─────────────────────────────
   Swipe left → delete, swipe right → mark read. touch-action: pan-y lets the
   list keep scrolling vertically while we own the horizontal gesture. */
function NotificationCard({
  n,
  locale,
  t,
  onOpen,
  onMarkRead,
  onDelete,
}: {
  n: NotificationItem;
  locale: string;
  t: (k: TKey) => string;
  onOpen: (n: NotificationItem) => void;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { icon: Icon, circle } = visualFor(n.type);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [ripples, setRipples] = useState<
    { key: number; x: number; y: number; size: number }[]
  >([]);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);
  const THRESHOLD = 72;

  function addRipple(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    setRipples((rs) => [
      ...rs,
      {
        key: Date.now() + Math.floor(Math.random() * 1000),
        x: e.clientX - r.left - size / 2,
        y: e.clientY - r.top - size / 2,
        size,
      },
    ]);
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    moved.current = false;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — drag still works while over the card */
    }
    addRipple(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (startX.current == null) return;
    const d = e.clientX - startX.current;
    if (Math.abs(d) > 4) moved.current = true;
    setDx(d);
  }
  function endGesture() {
    const d = dx;
    startX.current = null;
    setDragging(false);
    if (d <= -THRESHOLD) {
      setExiting(true);
      void vibrate("medium");
      window.setTimeout(() => onDelete(n.id), 170);
    } else if (d >= THRESHOLD) {
      if (!n.read) {
        void vibrate("light");
        onMarkRead(n.id);
      }
      setDx(0);
    } else {
      setDx(0);
    }
  }

  const swipingLeft = dx < 0;
  const revealOpacity = Math.min(1, Math.abs(dx) / 44);

  const time = timeAgo(new Date(n.createdAt).getTime(), Date.now());
  const timeLabel =
    time.unit === "now"
      ? t("notif.time.now")
      : time.unit === "date"
        ? new Date(time.value).toLocaleDateString(locale)
        : `${time.value}${t(`notif.time.${time.unit}` as TKey)}`;

  return (
    <li
      className="tt-rise relative select-none"
      style={{
        transition: exiting
          ? "transform .18s ease-in, opacity .18s ease-in, max-height .18s ease-in, margin .18s ease-in"
          : undefined,
        transform: exiting ? "translateX(-110%)" : undefined,
        opacity: exiting ? 0 : undefined,
        maxHeight: exiting ? 0 : undefined,
      }}
    >
      {/* swipe-reveal background */}
      <div
        className={cn(
          "absolute inset-0 flex items-center rounded-2xl px-6 text-white",
          swipingLeft ? "justify-end bg-rose-500" : "justify-start bg-emerald-500"
        )}
        style={{ opacity: dragging || dx !== 0 ? revealOpacity : 0 }}
        aria-hidden="true"
      >
        {swipingLeft ? (
          <Trash2 className="h-5 w-5" />
        ) : (
          <Check className="h-5 w-5" />
        )}
      </div>

      {/* card face */}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClick={() => {
          if (!moved.current) onOpen(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpen(n);
        }}
        className={cn(
          "relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border p-3 shadow-sm transition-shadow active:shadow-md",
          n.read
            ? "border-border bg-card"
            : "border-indigo-500/20 bg-indigo-50/70 dark:bg-indigo-500/10"
        )}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? undefined : "transform .22s cubic-bezier(.32,.72,0,1)",
          touchAction: "pan-y",
        }}
      >
        {/* icon circle */}
        <span
          className={cn(
            "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-sm",
            circle
          )}
        >
          <Icon className="h-5 w-5" />
        </span>

        {/* text column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "flex-1 text-[15px] leading-snug",
                n.read ? "font-medium text-foreground/90" : "font-bold text-foreground"
              )}
            >
              {n.title}
            </p>
            <span className="mt-0.5 shrink-0 text-[11px] font-medium text-muted-foreground">
              {timeLabel}
            </span>
          </div>
          {n.body && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {n.body}
            </p>
          )}
        </div>

        {/* unread dot */}
        {!n.read && (
          <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
        )}

        {/* ripples */}
        {ripples.map((r) => (
          <span
            key={r.key}
            className="tt-ripple text-indigo-400/60"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
            onAnimationEnd={() =>
              setRipples((rs) => rs.filter((x) => x.key !== r.key))
            }
          />
        ))}
      </div>
    </li>
  );
}
