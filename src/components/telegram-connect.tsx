"use client";

import { useState } from "react";
import { Send, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import {
  createTelegramLinkAction,
  unlinkTelegramAction,
  type TelegramStatus,
} from "@/actions/telegram";

/**
 * Settings card: link the account to the Telegram bot via deep link
 * (t.me/<bot>?start=<one-time-token>). The bot stores the chat id when the
 * user taps Start; notifications then mirror the push triggers.
 */
export function TelegramConnect({ status }: { status: TelegramStatus }) {
  const { t } = useT();
  const [linked, setLinked] = useState(status.linked);
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState(false);

  if (!status.enabled) {
    return <p className="text-sm text-muted-foreground">{t("telegram.disabled")}</p>;
  }

  async function connect() {
    setBusy(true);
    try {
      const res = await createTelegramLinkAction();
      if (res.link) {
        window.open(res.link, "_blank", "noopener");
        setAwaiting(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await unlinkTelegramAction();
      setLinked(false);
      setAwaiting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-emerald-600">{t("telegram.linked")}</span>
          <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
            <Unlink className="me-1 h-4 w-4" />
            {t("telegram.unlink")}
          </Button>
        </div>
      ) : (
        <>
          <Button onClick={connect} disabled={busy}>
            <Send className="me-1 h-4 w-4" />
            {t("telegram.connect")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {awaiting ? t("telegram.awaiting") : t("telegram.hint")}
          </p>
        </>
      )}
    </div>
  );
}
