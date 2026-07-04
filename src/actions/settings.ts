"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, hashPassword } from "@/lib/auth";
import { setLocaleCookie } from "@/lib/locale";
import { settingsSchema } from "@/lib/validation";

export type SettingsState = { error?: string; ok?: boolean };

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse({
    locale: formData.get("locale"),
    newPassword: formData.get("newPassword") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }

  const data: { locale: string; passwordHash?: string; mustChangePassword?: boolean } = {
    locale: parsed.data.locale,
  };
  if (parsed.data.newPassword) {
    data.passwordHash = await hashPassword(parsed.data.newPassword);
    data.mustChangePassword = false; // #31 — clear the temp-password flag
  }

  await prisma.user.update({ where: { id: user.id }, data });
  setLocaleCookie(parsed.data.locale);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
