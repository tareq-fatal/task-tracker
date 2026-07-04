"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  NOTIFICATION_EVENTS,
  defaultPrefs,
  type ChannelPrefs,
} from "@/lib/notifications-core";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  const user = await requireUser();
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({
      where: { userId: user.id, tenantId: user.tenantId, read: false },
    }),
  ]);
  return {
    unread,
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      url: n.url,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** Lightweight unread count for the live badge (tenant-scoped). */
export async function getUnreadCount(): Promise<number> {
  const user = await requireUser();
  return prisma.notification.count({
    where: { userId: user.id, tenantId: user.tenantId, read: false },
  });
}

export async function markAllReadAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, tenantId: user.tenantId, read: false },
    data: { read: true },
  });
  return { ok: true };
}

export async function markReadAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { read: true },
  });
  return { ok: true };
}

export type NotificationPrefsView = {
  events: Array<{ event: string } & ChannelPrefs>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  digest: boolean;
};

export async function getNotificationPrefs(): Promise<NotificationPrefsView> {
  const user = await requireUser();
  const [rows, u] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: user.id } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { quietHoursStart: true, quietHoursEnd: true, notifyDigest: true },
    }),
  ]);
  const byEvent = new Map(rows.map((r) => [r.eventType, r]));
  return {
    quietHoursStart: u?.quietHoursStart ?? null,
    quietHoursEnd: u?.quietHoursEnd ?? null,
    digest: u?.notifyDigest ?? false,
    events: NOTIFICATION_EVENTS.map((event) => {
      const r = byEvent.get(event);
      const d = defaultPrefs(event);
      return {
        event,
        inApp: r?.inApp ?? d.inApp,
        webPush: r?.webPush ?? d.webPush,
        email: r?.email ?? d.email,
        native: r?.native ?? d.native,
      };
    }),
  };
}

export async function saveNotificationPrefsAction(
  _prev: { ok?: boolean },
  formData: FormData
): Promise<{ ok?: boolean }> {
  const user = await requireUser();

  for (const event of NOTIFICATION_EVENTS) {
    const data: ChannelPrefs = {
      inApp: formData.get(`${event}.inApp`) === "on",
      webPush: formData.get(`${event}.webPush`) === "on",
      email: formData.get(`${event}.email`) === "on",
      native: formData.get(`${event}.native`) === "on",
    };
    await prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId: user.id, eventType: event } },
      update: data,
      create: { userId: user.id, eventType: event, ...data },
    });
  }

  const parseHour = (v: FormDataEntryValue | null): number | null => {
    const s = v?.toString() ?? "";
    if (s === "") return null;
    const n = parseInt(s, 10);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      quietHoursStart: parseHour(formData.get("quietHoursStart")),
      quietHoursEnd: parseHour(formData.get("quietHoursEnd")),
      notifyDigest: formData.get("digest") === "on",
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** Register a native (Capacitor) push token for the current user. */
export async function registerDeviceAction(
  token: string,
  platform: string
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!token) return { ok: false };
  await prisma.notificationDevice.upsert({
    where: { token },
    update: { userId: user.id, platform },
    create: { userId: user.id, token, platform: platform || "android" },
  });
  return { ok: true };
}
