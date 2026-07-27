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
    data: { telegramLinkToken: token, telegramLinkTokenAt: new Date() },
  });
  return { link: `https://t.me/${telegramBotUsername}?start=${token}` };
}

export async function unlinkTelegramAction(): Promise<{ ok: boolean }> {
  const { user } = await requireTenant();
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramLinkToken: null, telegramLinkTokenAt: null },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/* ---------------- Admin: bulk onboarding + broadcast group ---------------- */

import { can } from "@/lib/roles";
import { isAdminRole } from "@/lib/enums";
import { NOTIFICATION_EVENTS, isNotificationEvent } from "@/lib/notifications-core";

async function requireTelegramAdmin() {
  const ctx = await requireTenant();
  if (!isAdminRole(ctx.user.role)) throw new Error("FORBIDDEN");
  return ctx;
}

export type OnboardingRow = {
  id: string;
  name: string;
  username: string;
  handle: string | null;
  nickname: string | null;
  linked: boolean;
  link: string | null; // deep link (null when already linked)
};

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Tenant user roster with per-user deep links. Mints a fresh one-time token
 *  (30-day validity) for everyone unlinked whose token is missing/expired —
 *  idempotent, so the admin page always shows working links. */
export async function getTelegramOnboarding(): Promise<OnboardingRow[]> {
  const { tenant } = await requireTelegramAdmin();
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true, name: true, username: true,
      telegramHandle: true, telegramNickname: true,
      telegramChatId: true, telegramLinkToken: true, telegramLinkTokenAt: true,
    },
    orderBy: { name: "asc" },
  });

  const rows: OnboardingRow[] = [];
  for (const u of users) {
    let token = u.telegramLinkToken;
    const expired =
      !u.telegramLinkTokenAt || Date.now() - u.telegramLinkTokenAt.getTime() > TOKEN_TTL_MS;
    if (!u.telegramChatId && (!token || expired)) {
      token = randomBytes(16).toString("hex");
      await prisma.user.update({
        where: { id: u.id },
        data: { telegramLinkToken: token, telegramLinkTokenAt: new Date() },
      });
    }
    rows.push({
      id: u.id,
      name: u.name,
      username: u.username,
      handle: u.telegramHandle,
      nickname: u.telegramNickname,
      linked: Boolean(u.telegramChatId),
      link:
        !u.telegramChatId && telegramBotUsername
          ? `https://t.me/${telegramBotUsername}?start=${token}`
          : null,
    });
  }
  return rows;
}

export type GroupSettings = { chatId: string; events: string[] };

export async function getTelegramGroupSettings(): Promise<GroupSettings> {
  const { tenant } = await requireTelegramAdmin();
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { telegramGroupChatId: true, telegramGroupEvents: true },
  });
  return {
    chatId: t?.telegramGroupChatId ?? "",
    events: (t?.telegramGroupEvents ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export async function setTelegramGroupSettingsAction(input: GroupSettings): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTelegramAdmin();
  if (!can(user.role, "editTenantSettings")) throw new Error("FORBIDDEN");
  const chatId = input.chatId.trim();
  const events = input.events.filter((e) => isNotificationEvent(e));
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      telegramGroupChatId: chatId || null,
      telegramGroupEvents: events.length ? events.join(",") : null,
    },
  });
  revalidatePath("/admin/telegram");
  return { ok: true };
}

/** Admin-only self-service toggle: mirror every tenant event to MY Telegram
 *  chat ("Alle Events empfangen"). Ignored by the sender for non-admin roles. */
export async function setNotifyAllEventsAction(enabled: boolean): Promise<{ ok: boolean }> {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  await prisma.user.update({
    where: { id: user.id },
    data: { notifyAllTenantEvents: enabled },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function getNotifyAllEvents(): Promise<boolean> {
  const { user } = await requireTenant();
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notifyAllTenantEvents: true },
  });
  return Boolean(u?.notifyAllTenantEvents);
}

export async function listNotificationEvents(): Promise<string[]> {
  // admin_activity is internal admin chatter — never a group broadcast option.
  return NOTIFICATION_EVENTS.filter((e) => e !== "admin_activity");
}
