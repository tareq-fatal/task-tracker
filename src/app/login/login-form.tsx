"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
import { LogIn } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <LogIn className="me-1 h-4 w-4" />
      {pending ? "…" : t("login.submit")}
    </Button>
  );
}

export function LoginForm({ returnUrl = "/" }: { returnUrl?: string }) {
  const { t } = useT();
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {/* Deep-link target (Telegram/push) — server-side sanitized again. */}
      <input type="hidden" name="returnUrl" value={returnUrl} />
      <div className="space-y-2">
        <Label htmlFor="username">{t("login.username")}</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("login.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>
      {state.error && (
        <p className="text-sm font-medium text-destructive">
          {state.error === "DEACTIVATED" ? t("login.deactivated") : t("login.error")}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
