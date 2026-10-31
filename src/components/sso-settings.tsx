"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  saveTenantSsoAction,
  type SsoSettingsState,
  type TenantSsoConfig,
} from "@/actions/sso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";

function SaveButton() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "…" : t("settings.sso.save")}
    </Button>
  );
}

export function SsoSettings({ config }: { config: TenantSsoConfig }) {
  const { t } = useT();
  const [state, formAction] = useFormState<SsoSettingsState, FormData>(
    saveTenantSsoAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("settings.sso.desc")}</p>

      <div className="space-y-2">
        <Label htmlFor="domains">{t("settings.sso.domains")}</Label>
        <Input
          id="domains"
          name="domains"
          defaultValue={config.domains}
          placeholder="example.com, example.org"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.sso.domainsHint")}
        </p>
      </div>

      <div className="divide-y rounded-md border">
        {config.providers.map((p) => (
          <div
            key={p.provider}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3"
          >
            <span className="min-w-24 font-medium">{p.label}</span>
            {p.configured ? (
              <>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={`enabled.${p.provider}`}
                    defaultChecked={p.enabled}
                    className="h-4 w-4"
                  />
                  {t("settings.sso.title")}
                </label>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    name={`auto.${p.provider}`}
                    defaultChecked={p.autoProvision}
                    className="h-4 w-4"
                  />
                  {t("settings.sso.autoProvision")}
                </label>
              </>
            ) : (
              <span className="text-xs italic text-muted-foreground">
                {t("settings.sso.notConfigured")}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.ok && (
          <span className="text-sm text-emerald-600">
            {t("settings.sso.saved")}
          </span>
        )}
      </div>
    </form>
  );
}
