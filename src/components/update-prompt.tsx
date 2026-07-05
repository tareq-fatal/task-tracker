"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/components/i18n-provider";

// How often we check for a new build, via both the SW's own update check and
// GET /api/version. Also how long the banner waits before auto-reloading if
// the user doesn't click — set to null to disable the auto-reload.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_RELOAD_DELAY_MS: number | null = 5 * 60 * 1000;

function reload() {
  window.location.reload();
}

/**
 * #40 — PWA cache hardening. When a new deploy lands, the service worker fetches
 * the new build; we detect that and show a non-intrusive "new version → reload"
 * bar instead of leaving the user on a stale/broken cached shell. The user
 * chooses when to reload — unless they ignore the banner long enough that we
 * reload for them, since a stale client left running indefinitely is worse
 * than an unexpected refresh.
 */
export function UpdatePrompt() {
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const knownVersion = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    navigator.serviceWorker.ready
      .then((reg) => {
        // A worker that's already waiting (update happened before this mounted).
        if (reg.waiting && navigator.serviceWorker.controller) setReady(true);

        // A new worker starts installing → flag once it's installed (an UPDATE,
        // i.e. there is already a controller; not the very first install).
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              setReady(true);
            }
          });
        });

        // Proactively check for a new SW build on the same cadence as the
        // /api/version poll below.
        interval = setInterval(() => reg.update().catch(() => {}), CHECK_INTERVAL_MS);
      })
      .catch(() => {});

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // Independent of the service worker: ask the server directly what version
    // it's running. Catches deploys where the SW's own asset hashes didn't
    // change (e.g. a hotfix that only touched the server) and gives us a
    // reliable, easy-to-test signal — bump package.json's "version" and the
    // next poll (or a page reload) picks it up immediately.
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version, startedAt } = (await res.json()) as {
          version: string;
          startedAt: string;
        };
        const key = `${version}@${startedAt}`;
        if (knownVersion.current === null) {
          knownVersion.current = key;
        } else if (knownVersion.current !== key) {
          setReady(true);
        }
      } catch {
        // Offline or the request failed — try again on the next tick.
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!ready || !AUTO_RELOAD_DELAY_MS) return;
    const timeout = setTimeout(reload, AUTO_RELOAD_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-3 border-t border-indigo-300 bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-lg dark:border-indigo-400/40">
      <RefreshCw className="h-4 w-4" />
      <span className="font-medium">{t("update.available")}</span>
      <button
        onClick={reload}
        className="rounded-md bg-white/20 px-3 py-1 text-sm font-semibold transition hover:bg-white/30"
      >
        {t("update.reload")}
      </button>
    </div>
  );
}
