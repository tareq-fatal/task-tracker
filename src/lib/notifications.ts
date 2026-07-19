import "server-only";
import { prisma } from "./prisma";
import { notifyUser as webPush } from "./push";
import { notifyUserTelegram } from "./telegram";
import { sendEmail, basicEmailTemplate } from "./email";
import { translate, type TKey } from "./i18n";
import { DEFAULT_LOCALE, type Locale } from "./enums";
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
  /** i18n key for the title — rendered in the RECIPIENT's locale at create time.
   *  Preferred over `title`; falls back to `title` when absent (legacy callers). */
  titleKey?: TKey;
  /** Raw, already-localized title. Used only when `titleKey` is not given. */
  title?: string;
  body?: string;
  url?: string;
  taskId?: string;
  actorUserId?: string; // don't notify the person who caused the event
  /** Per-call channel gate, ANDed with the user's prefs — lets a caller keep
   *  the in-app feed while suppressing push/email for low-priority noise
   *  (e.g. status changes on Low/Medium tasks). `false` disables a channel;
   *  absent/`true` leaves the pref untouched. */
  channelMask?: Partial<ChannelPrefs>;
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
  if (input.channelMask) {
    for (const k of Object.keys(ch) as (keyof ChannelPrefs)[]) {
      if (input.channelMask[k] === false) ch[k] = false;
    }
  }

  // Localise the title into the RECIPIENT's locale at create time (no migration:
  // the resolved string is stored in `title`). Legacy callers passing a raw
  // `title` still work; old rows keep whatever title they were written with.
  const finalTitle = input.titleKey
    ? translate((user.locale as Locale) || DEFAULT_LOCALE, input.titleKey)
    : input.title ?? "";

  if (ch.inApp) {
    await prisma.notification
      .create({
        data: {
          userId: input.recipientUserId,
          tenantId: input.tenantId,
          type: input.type,
          title: finalTitle,
          body: input.body ?? null,
          url: input.url ?? null,
          taskId: input.taskId ?? null,
        },
      })
      .catch(() => {});
  }
  if (ch.webPush) {
    await webPush(input.recipientUserId, { title: finalTitle, body: input.body ?? "", url: input.url });
    // Telegram rides the webPush preference: same triggers, same masks
    // (assigned/comment/mention, status only High+Critical, due_soon).
    // No-op when the user hasn't linked a chat.
    await notifyUserTelegram(input.recipientUserId, {
      title: finalTitle,
      body: input.body ?? "",
      url: input.url,
    }).catch(() => {});
  }
  if (ch.email && user.email && user.email.includes("@")) {
    await sendEmail({
      to: user.email,
      subject: finalTitle,
      html: basicEmailTemplate(finalTitle, input.body ?? "", input.url),
    }).catch(() => false);
  }
  if (ch.native) {
    await sendNative(input.recipientUserId, { ...input, title: finalTitle }).catch(() => {});
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
