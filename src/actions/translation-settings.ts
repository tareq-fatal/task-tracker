"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Profile setting: TR↔x auto-translation on display. false = always show
 *  the original ("immer Original anzeigen"). Own account only. */
export async function setAutoTranslateAction(enabled: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { autoTranslate: Boolean(enabled) },
  });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
