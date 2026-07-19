"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

const DISMISS_KEY = "tt-push-banner-dismissed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribeAndRegister(vapidPublicKey: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
  return res.ok;
}

/**
 * Mounted once in the app layout. Makes push delivery robust:
 *  1. Permission already granted → silently (re)subscribe and sync the
 *     subscription to the server on every app open (new device, rotated or
 *     expired subscription, cleared site data — pushes just keep working).
 *  2. Permission never asked → one small dismissible banner. The button click
 *     is the user gesture Safari/iOS ≥16.4 require for requestPermission().
 *  Permission denied → renders nothing, never nags.
 */
export function PushBootstrap({ vapidPublicKey }: { vapidPublicKey: string }) {
  const { t } = useT();
  const [showBanner, setShowBanner] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      Boolean(vapidPublicKey);
    if (!supported) return;

    if (Notification.permission === "granted") {
      // Re-sync silently. subscribe() with the same key is idempotent when a
      // subscription exists; the server upsert re-binds it to this user.
      subscribeAndRegister(vapidPublicKey).catch(() => {});
      return;
    }
    if (
      Notification.permission === "default" &&
      localStorage.getItem(DISMISS_KEY) !== "1"
    ) {
      setShowBanner(true);
    }
  }, [vapidPublicKey]);

  if (!showBanner) return null;

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") await subscribeAndRegister(vapidPublicKey);
      setShowBanner(false);
      if (perm !== "default") localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      setShowBanner(false);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShowBanner(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-background p-3 shadow-lg sm:inset-x-auto sm:end-4 sm:start-auto">
      <Bell className="h-5 w-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">{t("push.banner.text")}</p>
      <Button size="sm" onClick={enable} disabled={busy}>
        {busy ? "…" : t("push.banner.enable")}
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("push.banner.later")}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
