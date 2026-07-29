"use client";

import { useTransition } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { switchAccountAction } from "@/actions/auth";

/** "Sign in with a different account" on the no-access pages: ends the
 *  current (possibly stale WebView) session and goes to login with the
 *  denied URL as returnUrl — after logging in correctly, the user lands
 *  exactly on the task the notification pointed to. */
export function SwitchAccountButton({ returnUrl }: { returnUrl: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="default"
      disabled={pending}
      onClick={() => start(() => switchAccountAction(returnUrl))}
    >
      {pending ? (
        <Loader2 className="me-1 h-4 w-4 animate-spin" />
      ) : (
        <LogIn className="me-1 h-4 w-4" />
      )}
      {t("noAccess.switchAccount")}
    </Button>
  );
}
