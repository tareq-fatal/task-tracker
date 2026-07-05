"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { setLocaleCookie } from "@/lib/locale";
import { isLocale } from "@/lib/enums";
import { loginSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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

  // Slow down credential stuffing / brute force: cap attempts per IP and
  // per targeted username independently so one abusive IP can't lock out
  // a legitimate user's IP, and vice versa.
  const ip = clientIp();
  const ipLimit = rateLimit(`login:ip:${ip}`, { limit: 20, windowSeconds: 60 });
  const userLimit = rateLimit(`login:user:${username.toLowerCase()}`, {
    limit: 10,
    windowSeconds: 60,
  });
  if (!ipLimit.ok || !userLimit.ok) {
    return { error: "RATE_LIMITED" };
  }

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return { error: "INVALID" };
  }

  await createSession(user.id);
  if (isLocale(user.locale)) setLocaleCookie(user.locale);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
