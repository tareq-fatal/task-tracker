"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateSettingsAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
import { LOCALES } from "@/lib/enums";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56";

const LOCALE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "English",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function SettingsForm({ locale, minimal = false }: { locale: string; minimal?: boolean }) {
  const { t } = useT();
  const [state, formAction] = useFormState(updateSettingsAction, {});

  return (
    <form action={formAction} className="space-y-5">
      {minimal && <input type="hidden" name="locale" value={locale} />}
      {!minimal && (
        <div className="space-y-2">
          <Label htmlFor="locale">{t("settings.language")}</Label>
          <select
            id="locale"
            name="locale"
            defaultValue={locale}
            className={selectClass}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          className="sm:w-56"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.changePassword")} — min. 6
        </p>
      </div>

      {state.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-sm font-medium text-emerald-600">
          {t("settings.saved")} ✓
        </p>
      )}

      <Submit label={t("settings.save")} />
    </form>
  );
}
