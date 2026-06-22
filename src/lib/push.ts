import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@task-tracker.local";

export const pushEnabled = Boolean(publicKey && privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/** Best-effort: send a push to every subscription of a user. Never throws. */
export async function notifyUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!pushEnabled) return;
  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch {
    return;
  }

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        // 404/410 => subscription gone, clean it up
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        }
      }
    })
  );
}
