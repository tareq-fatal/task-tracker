"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { telegramBotUsername, telegramEnabled } from "@/lib/telegram";

export type TelegramStatus = {
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
};

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const { user } = await requireTenant();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  });
  return {
    enabled: telegramEnabled && Boolean(telegramBotUsername),
    botUsername: telegramBotUsername,
    linked: Boolean(row?.telegramChatId),
  };
}

/** Mint a one-time link token and return the t.me deep link. */
export async function createTelegramLinkAction(): Promise<{ link?: string; error?: string }> {
  const { user } = await requireTenant();
  if (!telegramEnabled || !telegramBotUsername) return { error: "DISABLED" };
  const token = randomBytes(16).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramLinkToken: token },
  });
  return { link: `https://t.me/${telegramBotUsername}?start=${token}` };
}

export async function unlinkTelegramAction(): Promise<{ ok: boolean }> {
  const { user } = await requireTenant();
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramLinkToken: null },
  });
  revalidatePath("/settings");
  return { ok: true };
}
