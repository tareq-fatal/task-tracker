"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

/** Shows a freshly minted invite link once, with a copy button (TOF-0783). */
export function InviteLinkBox({ link }: { link: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5" data-testid="invite-link">
      <div className="flex items-center gap-2">
        <input
          readOnly
          dir="ltr"
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
          aria-label={t("invite.link")}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {});
          }}
        >
          {copied ? <Check className="me-1 h-4 w-4" /> : <Copy className="me-1 h-4 w-4" />}
          {copied ? t("invite.copied") : t("invite.copy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("invite.linkOnce")}</p>
    </div>
  );
}
