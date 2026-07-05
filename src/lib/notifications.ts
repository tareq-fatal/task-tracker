import "server-only";
import { prisma } from "./prisma";
import { notifyUser as webPush } from "./push";
import { sendEmail, basicEmailTemplate } from "./email";
import { translate, type TKey } from "./i18n";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./enums";
import {
  defaultPrefs,
  resolveChannels,
  type NotificationEvent,
  type ChannelPrefs,
} from "./notifications-core";

export type NotifyInput = {
  recipientUserId: string;
  tenantId: string;
  type: NotificationEvent;
  /** Literal title — only for dynamic content (e.g. "Actor: Task"). Prefer titleKey. */
  title?: string;
  /** Dictionary key, translated into each recipient's own locale. */
  titleKey?: TKey;
  body?: string;
  url?: string;
  taskId?: string;
  actorUserId?: string; // don't notify the person who caused the event
};

/** Central fan-out: in-app feed + web-push + email + native, per user prefs. */
export async function notify(input: NotifyInput): Promise<void> {
  if (input.actorUserId && input.actorUserId === input.recipientUserId) return;

  let user: { email: string | null; locale: string; quietHoursStart: number | null; quietHoursEnd: number | null } | null;
  let prefRow: ChannelPrefs | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: input.recipientUserId },
      select: { email: true, locale: true, quietHoursStart: true, quietHoursEnd: true },
    });
    if (!user) return;
    const row = await prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId: input.recipientUserId, eventType: input.type } },
    });
    if (row) prefRow = { inApp: row.inApp, webPush: row.webPush, email: row.email, native: row.native };
  } catch {
    return;
  }

  const prefs = prefRow ?? defaultPrefs(input.type);
  const ch = resolveChannels(prefs, {
    hour: new Date().getHours(),
    quietStart: user.quietHoursStart,
    quietEnd: user.quietHoursEnd,
  });

  // Render the title in the recipient's language (stored per user).
  const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const title = input.titleKey ? translate(locale, input.titleKey) : input.title ?? "";

  if (ch.inApp) {
    await prisma.notification
      .create({
        data: {
          userId: input.recipientUserId,
          tenantId: input.tenantId,
          type: input.type,
          title,
          body: input.body ?? null,
          url: input.url ?? null,
          taskId: input.taskId ?? null,
        },
      })
      .catch(() => {});
  }
  if (ch.webPush) {
    await webPush(input.recipientUserId, { title, body: input.body ?? "", url: input.url });
  }
  if (ch.email && user.email && user.email.includes("@")) {
    await sendEmail({
      to: user.email,
      subject: title,
      html: basicEmailTemplate(title, input.body ?? "", input.url, locale),
    }).catch(() => false);
  }
  if (ch.native) {
    await sendNative(input.recipientUserId, { ...input, title }).catch(() => {});
  }
}

export async function notifyMany(
  recipientUserIds: string[],
  base: Omit<NotifyInput, "recipientUserId">
): Promise<void> {
  const unique = [...new Set(recipientUserIds)].filter(Boolean);
  await Promise.all(unique.map((id) => notify({ ...base, recipientUserId: id })));
}

/** Native push via FCM legacy HTTP. No-op without FCM_SERVER_KEY. */
async function sendNative(userId: string, input: NotifyInput): Promise<void> {
  const key = process.env.FCM_SERVER_KEY;
  if (!key) return;
  const devices = await prisma.notificationDevice.findMany({ where: { userId } });
  if (devices.length === 0) return;
  await Promise.all(
    devices.map(async (d) => {
      try {
        const res = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: { Authorization: `key=${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: d.token,
            notification: { title: input.title, body: input.body ?? "" },
            data: { url: input.url ?? "/" },
          }),
        });
        if (res.status === 404 || res.status === 410) {
          await prisma.notificationDevice.delete({ where: { id: d.id } }).catch(() => {});
        }
      } catch {
        /* best-effort */
      }
    })
  );
}
