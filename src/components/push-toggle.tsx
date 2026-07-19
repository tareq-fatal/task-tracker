"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const { t } = useT();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      Boolean(vapidPublicKey);
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, [vapidPublicKey]);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey
        ) as BufferSource,
      });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setSubscribed(true);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.pushUnsupported")}
      </p>
    );
  }

  async function sendTest() {
    setTestState("sending");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setTestState(res.ok && data.ok ? "sent" : "failed");
    } catch {
      setTestState("failed");
    }
    setTimeout(() => setTestState("idle"), 5000);
  }

  return subscribed ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={disable} disabled={busy}>
        <BellOff className="me-1 h-4 w-4" />
        {busy ? "…" : "Aus / Off"}
      </Button>
      <Button variant="secondary" onClick={sendTest} disabled={testState === "sending"}>
        {testState === "sending" ? "…" : t("push.test.button")}
      </Button>
      {testState === "sent" && (
        <span className="text-sm text-emerald-600">{t("push.test.sent")}</span>
      )}
      {testState === "failed" && (
        <span className="text-sm text-destructive">{t("push.test.failed")}</span>
      )}
    </div>
  ) : (
    <Button onClick={enable} disabled={busy}>
      <Bell className="me-1 h-4 w-4" />
      {busy ? "…" : t("settings.enablePush")}
    </Button>
  );
}
