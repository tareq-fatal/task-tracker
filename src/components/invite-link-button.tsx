"use client";

import { useState, useTransition } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { createInviteAction } from "@/actions/invites";
import { InviteLinkBox } from "@/components/invite-link-box";

/**
 * „Einladungslink erzeugen“ per user row in /admin/users (TOF-0783, Tarek
 * 28.10.2026). Each click mints a NEW link and invalidates the previous one;
 * the link is only shown here, once.
 */
export function InviteLinkButton({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useT();
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={t("invite.create")}
        aria-label={t("invite.create")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(false);
            const res = await createInviteAction(userId).catch(() => null);
            if (res?.link) setLink(res.link);
            else setErr(true);
          })
        }
      >
        <Link2 className="h-4 w-4" />
      </Button>
      {err && <span className="text-xs text-destructive">{t("invite.error")}</span>}
      {link && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button aria-label={t("nav.close")} className="absolute inset-0 bg-black/50" onClick={() => setLink(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{t("invite.create")} — {userName}</h2>
              <button onClick={() => setLink(null)} aria-label={t("nav.close")} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <InviteLinkBox link={link} />
          </div>
        </div>
      )}
    </>
  );
}
