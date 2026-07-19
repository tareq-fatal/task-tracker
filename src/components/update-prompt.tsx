"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useT } from "@/components/i18n-provider";

/**
 * #40 — PWA update prompt, hardened against false positives:
 *  - update checks only every 60 min and when the tab regains focus (the old
 *    2-minute poll amplified CDN cache flapping into phantom updates)
 *  - the banner only appears while a NEW worker is actually in `waiting`
 *    state (a real update; never on first install)
 *  - dismiss is remembered for 6 h (localStorage), so the same update does
 *    not nag repeatedly
 *  - the banner waits until the user has been idle for 30 s — it never pops
 *    up mid-typing
 * The user always chooses when to reload; no surprise refreshes.
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 60 min
const DISMISS_KEY = "tt-update-dismissed-at";
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const IDLE_MS = 30 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function UpdatePrompt() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastInputRef = useRef(Date.now());
  const pendingRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let idleTimer: ReturnType<typeof setInterval> | undefined;
    let alive = true;

    // Only surface when a real update is WAITING right now and the user is
    // idle (no input for 30 s) — otherwise keep it pending and retry.
    const maybeShow = () => {
      if (!alive || !pendingRef.current || recentlyDismissed()) return;
      const stillWaiting = Boolean(regRef.current?.waiting);
      if (!stillWaiting) {
        pendingRef.current = false;
        setShow(false);
        return;
      }
      if (Date.now() - lastInputRef.current >= IDLE_MS) setShow(true);
    };

    const onActivity = () => {
      lastInputRef.current = Date.now();
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });

    const onFocus = () => regRef.current?.update().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    navigator.serviceWorker.ready
      .then((reg) => {
        if (!alive) return;
        regRef.current = reg;

        // Update already waiting from before this page load.
        if (reg.waiting && navigator.serviceWorker.controller) {
          pendingRef.current = true;
        }

        // New worker installs → a genuine update only when a controller exists.
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              pendingRef.current = true;
            }
          });
        });

        interval = setInterval(() => reg.update().catch(() => {}), CHECK_INTERVAL_MS);
        idleTimer = setInterval(maybeShow, 5000);
        maybeShow();
      })
      .catch(() => {});

    return () => {
      alive = false;
      if (interval) clearInterval(interval);
      if (idleTimer) clearInterval(idleTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-3 border-t border-indigo-300 bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-lg dark:border-indigo-400/40">
      <RefreshCw className="h-4 w-4" />
      <span className="font-medium">{t("update.available")}</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-white/20 px-3 py-1 text-sm font-semibold transition hover:bg-white/30"
      >
        {t("update.reload")}
      </button>
      <button
        onClick={dismiss}
        aria-label={t("nav.close")}
        className="rounded-md p-1 text-white/80 transition hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
