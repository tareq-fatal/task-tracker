"use client";

import { useState, useTransition } from "react";
import { Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";
import {
  setTelegramGroupSettingsAction,
  type GroupSettings,
} from "@/actions/telegram";

/**
 * Optional broadcast group (Weg 2): the admin creates the group manually,
 * adds the bot as admin, pastes the group chat id here and picks which
 * notification events get mirrored into the group.
 */
export function TelegramGroupSettings({
  initial,
  events,
  bot = null,
}: {
  initial: GroupSettings;
  events: string[];
  /** TOF-0795: Benutzername des Bots (ohne @), vom Server; null = allgemeiner Text. */
  bot?: string | null;
}) {
  const { t } = useT();
  const [chatId, setChatId] = useState(initial.chatId);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.events));
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function toggle(ev: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-5 print:hidden">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
        <Users2 className="h-4 w-4 text-indigo-600" />
        {t("tg.group.title")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("tg.group.help", { bot: bot ? `@${bot}` : t("tg.group.botGeneric") })}</p>

      <label className="mb-1 block text-sm font-medium">{t("tg.group.chatId")}</label>
      <Input
        dir="ltr"
        value={chatId}
        onChange={(e) => setChatId(e.target.value)}
        placeholder="-1001234567890"
        className="mb-4 max-w-xs"
      />

      <p className="mb-1 text-sm font-medium">{t("tg.group.events")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {events.map((ev) => (
          <label
            key={ev}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-500/10"
          >
            <input
              type="checkbox"
              checked={selected.has(ev)}
              onChange={() => toggle(ev)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            {t(`notif.ev.${ev}` as TKey)}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setTelegramGroupSettingsAction({
                chatId,
                events: [...selected],
              });
              setSaved(res.ok);
              setTimeout(() => setSaved(false), 3000);
            })
          }
        >
          {t("tg.group.save")}
        </Button>
        {saved && <span className="text-sm text-emerald-600">{t("tg.group.saved")}</span>}
      </div>
    </section>
  );
}
