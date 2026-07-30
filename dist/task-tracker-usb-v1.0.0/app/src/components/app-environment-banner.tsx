"use client";

import { useEffect, useState } from "react";
import { Download, TriangleAlert, X } from "lucide-react";
import { isNativeApp } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

const DISMISS_APK = "tt-apk-push-warn-dismissed";
const DISMISS_INSTALL = "tt-install-banner-dismissed";

type Mode = "none" | "apk-warning" | "install";

/**
 * Environment-aware banner at the top of the content area.
 *
 *  - Inside the Capacitor APK: web push does not work in the Android system
 *    WebView and native FCM is not wired up — warn the user and point them to
 *    the installable PWA, where push works today (VAPID web push via Chrome).
 *  - In an Android browser tab (not installed, not APK): offer "install app"
 *    prominently. Uses Chrome's beforeinstallprompt when available; otherwise
 *    shows the manual ⋮ → "Add to Home screen" hint.
 *  - Installed PWA / desktop: renders nothing.
 */
export function AppEnvironmentBanner() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>("none");
  const [installEvent, setInstallEvent] = useState<any>(null);

  useEffect(() => {
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as any).standalone === true;
      if (isNativeApp()) {
        if (localStorage.getItem(DISMISS_APK) !== "1") setMode("apk-warning");
        return;
      }
      const isAndroidBrowser = /Android/i.test(navigator.userAgent) && !standalone;
      if (isAndroidBrowser && localStorage.getItem(DISMISS_INSTALL) !== "1") {
        setMode("install");
      }
    } catch {
      /* SSR/exotic environments: no banner */
    }
  }, []);

  // Chrome fires this when the PWA is installable — capture it so our button
  // can trigger the real install dialog.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setMode("none");
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "none") return null;

  function dismiss(key: string) {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    setMode("none");
  }

  if (mode === "apk-warning") {
    return (
      <div className="flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold">{t("env.apkNoPushTitle")}</p>
          <p className="mt-0.5">{t("env.apkNoPushText")}</p>
        </div>
        <button
          onClick={() => dismiss(DISMISS_APK)}
          aria-label={t("nav.close")}
          className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-500/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b bg-gradient-to-r from-indigo-500/10 to-pink-500/10 px-4 py-3 text-sm">
      <Download className="h-5 w-5 shrink-0 text-indigo-600" />
      <div className="flex-1">
        <p className="font-semibold">{t("env.installTitle")}</p>
        <p className="mt-0.5 text-muted-foreground">
          {installEvent ? t("env.installText") : t("env.installHint")}
        </p>
      </div>
      {installEvent && (
        <Button
          size="sm"
          onClick={async () => {
            try {
              installEvent.prompt();
              const choice = await installEvent.userChoice;
              if (choice?.outcome === "accepted") setMode("none");
            } catch {}
          }}
        >
          {t("env.installButton")}
        </Button>
      )}
      <button
        onClick={() => dismiss(DISMISS_INSTALL)}
        aria-label={t("nav.close")}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
