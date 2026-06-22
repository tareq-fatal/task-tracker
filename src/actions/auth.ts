"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

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

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
