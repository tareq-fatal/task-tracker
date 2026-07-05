"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/components/i18n-provider";

/**
 * #40 — PWA cache hardening. When a new deploy lands, the service worker fetches
 * the new build; we detect that and show a non-intrusive "new version → reload"
 * bar instead of leaving the user on a stale/broken cached shell. The user
 * chooses when to reload (never a surprise refresh mid-work).
 */
export function UpdatePrompt() {
  const { t } = useT();
  const [ready, setReady] = useState(false);

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

        // Proactively check for a new build every 2 minutes while the app is open.
        interval = setInterval(() => reg.update().catch(() => {}), 120000);
      })
      .catch(() => {});

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  if (!ready) return null;

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
    </div>
  );
}
