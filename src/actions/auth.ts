"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { setLocaleCookie } from "@/lib/locale";
import { isLocale } from "@/lib/enums";
import { loginSchema } from "@/lib/validation";
import { safeReturnUrl } from "@/lib/return-url";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "INVALID" };
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return { error: "INVALID" };
  }

  // Temporarily deactivated accounts (SubAdmin feature): friendly block.
  if (user.deactivatedAt) {
    return { error: "DEACTIVATED" };
  }

  await createSession(user.id);
  if (isLocale(user.locale)) setLocaleCookie(user.locale);
  // Deep-link flow (Telegram/push): land on the notified task, not "/".
  redirect(safeReturnUrl(formData.get("returnUrl") as string | null));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/**
 * "Sign in with a different account" on the no-access page — the fix for the
 * Telegram-WebView identity mismatch (its cookie jar can hold a STALE session
 * of another user, e.g. the IT account used during device setup, while the
 * notification correctly targeted the real assignee). Ends the wrong session
 * and returns to login with the task as returnUrl.
 */
export async function switchAccountAction(returnUrl: string): Promise<void> {
  await destroySession();
  redirect(`/login?returnUrl=${encodeURIComponent(safeReturnUrl(returnUrl))}`);
}
