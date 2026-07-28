"use client";

import { useState } from "react";
import { Check, Copy, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import type { OnboardingRow } from "@/actions/telegram";

type Row = OnboardingRow & { qr: string | null };

/**
 * Printable roster of per-user Telegram deep links + QR codes. Telegram
 * forbids bots from adding members, so each user must tap their own link
 * (or scan their QR) once — the /start payload links them instantly.
 */
export function TelegramOnboardingList({ rows }: { rows: Row[] }) {
  const { t } = useT();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const linkedCount = rows.filter((r) => r.linked).length;

  return (
    <section className="mb-8" id="tg-onboarding-print">
      <div className="mb-3 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          {linkedCount} / {rows.length} — {t("tg.connected")}
        </p>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="me-1 h-4 w-4" />
          {t("tg.print")}
        </Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 print:break-inside-avoid"
          >
            {r.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.qr} alt="" className="h-24 w-24 shrink-0 rounded-md border" />
            ) : (
              <span className="grid h-24 w-24 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-emerald-600">
                <Check className="h-8 w-8" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">
                {r.handle ?? `@${r.username}`}
              </p>
              {r.linked ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  ✓ {t("tg.connected")}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-amber-600">{t("tg.notConnected")}</p>
                  {r.link && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1.5 print:hidden"
                      onClick={() => copy(r.id, r.link!)}
                    >
                      {copied === r.id ? (
                        <Check className="me-1 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="me-1 h-3.5 w-3.5" />
                      )}
                      {copied === r.id ? t("tg.copied") : t("tg.copy")}
                    </Button>
                  )}
                </>
              )}
            </div>
            <Send className="hidden h-4 w-4 shrink-0 text-indigo-400 print:block" />
          </li>
        ))}
      </ul>
    </section>
  );
}
