"use client";

import { useT } from "@/components/i18n-provider";
import { PROVIDER_LABELS, type SsoProvider } from "@/lib/sso";

const ICONS: Record<SsoProvider, string> = {
  "azure-ad": "🪟",
  google: "🇬",
  github: "🐙",
  apple: "",
};

export function SsoButtons({ providers }: { providers: SsoProvider[] }) {
  const { t } = useT();
  if (providers.length === 0) return null;

  return (
    <div className="mt-4" data-testid="sso-buttons">
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("login.sso.divider")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        {providers.map((p) => (
          <a
            key={p}
            href={`/api/auth/${p}/start`}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            <span aria-hidden>{ICONS[p]}</span>
            {PROVIDER_LABELS[p]}
          </a>
        ))}
      </div>
    </div>
  );
}
