"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";
import {
  getNotifications,
  markAllReadAction,
  markReadAction,
  type NotificationItem,
} from "@/actions/notifications";

export function NotificationBell() {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    const data = await getNotifications();
    setItems(data.items);
    setUnread(data.unread);
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

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await refresh(); // show the freshest list on open
      if (unread > 0) {
        await markAllReadAction();
        setUnread(0);
        setItems((xs) => xs.map((x) => ({ ...x, read: true })));
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={t("notif.title")}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/40 shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">{t("notif.title")}</span>
            {items.some((i) => !i.read) ? null : (
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
                      {formatDateTime(n.createdAt, locale)}
                    </div>
                  </div>
                );
                return n.url ? (
                  <Link
                    key={n.id}
                    href={n.url}
                    onClick={() => {
                      markReadAction(n.id);
                      setOpen(false);
                    }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
