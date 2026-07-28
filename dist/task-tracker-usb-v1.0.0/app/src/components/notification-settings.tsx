"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  saveNotificationPrefsAction,
  type NotificationPrefsView,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

const CHANNELS = ["inApp", "webPush", "email", "native"] as const;

function SaveBtn() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "…" : t("notif.save")}
    </Button>
  );
}

export function NotificationSettings({ view }: { view: NotificationPrefsView }) {
  const { t } = useT();
  const [state, formAction] = useFormState(saveNotificationPrefsAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="p-2 text-start font-medium">{t("notif.event")}</th>
              {CHANNELS.map((c) => (
                <th key={c} className="p-2 font-medium">
                  {t(`notif.ch.${c}` as TKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {view.events.map((row) => (
              <tr key={row.event}>
                <td className="p-2 font-medium">
                  {t(`notif.ev.${row.event}` as TKey)}
                </td>
                {CHANNELS.map((c) => (
                  <td key={c} className="p-2 text-center">
                    <input
                      type="checkbox"
                      name={`${row.event}.${c}`}
                      defaultChecked={row[c]}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">
            {t("notif.quietStart")}
          </span>
          <HourSelect name="quietHoursStart" value={view.quietHoursStart} t={t} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">
            {t("notif.quietEnd")}
          </span>
          <HourSelect name="quietHoursEnd" value={view.quietHoursEnd} t={t} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="digest"
            defaultChecked={view.digest}
            className="h-4 w-4 accent-indigo-600"
          />
          {t("notif.digest")}
        </label>
      </div>

      <div className="flex items-center gap-3">
        <SaveBtn />
        {state.ok && (
          <span className="text-sm text-emerald-600">{t("notif.saved")}</span>
        )}
      </div>
    </form>
  );
}

function HourSelect({
  name,
  value,
  t,
}: {
  name: string;
  value: number | null;
  t: (k: TKey) => string;
}) {
  return (
    <select
      name={name}
      defaultValue={value == null ? "" : String(value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">{t("notif.off")}</option>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}
