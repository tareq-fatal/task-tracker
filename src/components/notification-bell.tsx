"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import {
  getNotifications,
  markAllReadAction,
  markReadAction,
  type NotificationItem,
} from "@/actions/notifications";

export function NotificationBell() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    const data = await getNotifications();
    setItems(data.items);
    setUnread(data.unread);
  }

  // initial load
  useEffect(() => {
    refresh();
  }, []);

  // real-time stream (SSE); falls back to 60s polling if it can't connect
  useEffect(() => {
    let es: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (pollId) return;
      pollId = setInterval(refresh, 60000);
    }

    try {
      es = new EventSource("/api/notifications/stream");
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { kind: string; item?: NotificationItem };
          if (msg.kind === "new" && msg.item) {
            const item = msg.item;
            setItems((xs) =>
              xs.some((x) => x.id === item.id) ? xs : [item, ...xs].slice(0, 30)
            );
            setUnread((n) => n + 1);
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects; add a poll as a safety net meanwhile
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      es?.close();
      if (pollId) clearInterval(pollId);
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
    setOpen((v) => !v);
  }

  async function markAll() {
    if (unread === 0) return;
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    await markAllReadAction();
  }

  // Telegram-style: reading one item decrements the badge, not the whole inbox.
  function readOne(n: NotificationItem) {
    if (n.read) return;
    setUnread((u) => Math.max(0, u - 1));
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    markReadAction(n.id);
  }

  const hasUnread = unread > 0;

  return (
    <div ref={ref} className="relative">
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

      {open && (
        <div className="glass absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/40 shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">{t("notif.title")}</span>
            {hasUnread ? (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                const inner = (
                  <div
                    className={cn(
                      "border-b px-4 py-3 text-sm transition-colors hover:bg-secondary/60",
                      !n.read && "bg-indigo-50/60"
                    )}
                  >
                    <div className="font-medium">{n.title}</div>
                    {n.body && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                );
                return n.url ? (
                  <Link
                    key={n.id}
                    href={n.url}
                    onClick={() => {
                      readOne(n);
                      setOpen(false);
                    }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => readOne(n)}
                    className="block w-full text-start"
                  >
                    {inner}
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
