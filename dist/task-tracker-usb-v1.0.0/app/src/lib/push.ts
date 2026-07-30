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

export type PushSendResult = { endpoint: string; ok: boolean; statusCode?: number };

/** Best-effort: send a push to every subscription of a user. Never throws.
 *  Outcomes are logged (visible via `docker logs task-tracker`) so failed
 *  sends are diagnosable instead of silently swallowed. */
export async function notifyUser(
  userId: string,
  payload: PushPayload
): Promise<PushSendResult[]> {
  if (!pushEnabled) return [];
  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch {
    return [];
  }

  return Promise.all(
    subs.map(async (s): Promise<PushSendResult> => {
      const host = new URL(s.endpoint).host;
      try {
        const r = await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload)
        );
        console.info(`[push] sent to ${host} (user ${userId}) → ${r.statusCode}`);
        return { endpoint: s.endpoint, ok: true, statusCode: r.statusCode };
      } catch (err: any) {
        console.error(
          `[push] FAILED to ${host} (user ${userId}) → ${err?.statusCode ?? "?"} ${String(err?.body ?? err?.message ?? "").slice(0, 200)}`
        );
        // 404/410 => subscription gone, clean it up
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        }
        return { endpoint: s.endpoint, ok: false, statusCode: err?.statusCode };
      }
    })
  );
}
