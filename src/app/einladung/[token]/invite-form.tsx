"use client";

import { useFormState, useFormStatus } from "react-dom";
import { KeyRound } from "lucide-react";
import { redeemInviteAction, type RedeemInviteState } from "@/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <KeyRound className="me-1 h-4 w-4" />
      {pending ? "…" : t("invite.submit")}
    </Button>
  );
}

/** „Passwort festlegen“ über den Einladungslink (TOF-0783). */
// minLength comes from the server page (lib/invite.ts pulls in node:crypto).
export function InviteForm({ token, minLength }: { token: string; minLength: number }) {
  const { t } = useT();
  const [state, formAction] = useFormState<RedeemInviteState, FormData>(redeemInviteAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">{t("invite.newPassword")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          autoFocus
          placeholder="••••••••"
        />
        <p className="text-xs text-muted-foreground">{t("invite.minHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="repeat">{t("invite.repeat")}</Label>
        <Input
          id="repeat"
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          placeholder="••••••••"
        />
      </div>
      {state.error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error === "TOO_SHORT"
            ? t("invite.err.TOO_SHORT")
            : state.error === "MISMATCH"
              ? t("invite.err.MISMATCH")
              : t("invite.invalid.text")}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
