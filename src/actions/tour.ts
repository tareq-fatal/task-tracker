"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Mark the welcome tour as seen (called on finish or skip). */
export async function completeTourAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { hasSeenTour: true },
  });
  return { ok: true };
}

/** Reset the tour so it runs again (Settings → "restart intro"). */
export async function restartTourAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { hasSeenTour: false },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
