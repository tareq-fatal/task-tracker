"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { setLocaleCookie } from "@/lib/locale";
import { isLocale } from "@/lib/enums";

/** Set the active locale (cookie) and persist it on the user if logged in. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  setLocaleCookie(locale);

  const user = await getCurrentUser();
  if (user) {
    await prisma.user
      .update({ where: { id: user.id }, data: { locale } })
      .catch(() => {});
  }

  revalidatePath("/", "layout");
}
