import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyUser, pushEnabled } from "@/lib/push";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";

// Send a test push to the CURRENT user's own subscriptions only. Lets a user
// verify end-to-end delivery (device shows a notification) without waiting
// for a real event — self-caused events deliberately never notify oneself.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushEnabled) return NextResponse.json({ error: "push_disabled" }, { status: 503 });

  const count = await prisma.pushSubscription.count({ where: { userId: user.id } });
  if (count === 0) return NextResponse.json({ error: "no_subscription" }, { status: 404 });

  const t = getDictionary(getActiveLocale());
  const results = await notifyUser(user.id, {
    title: t["push.test.title"],
    body: t["push.test.body"],
    url: "/settings",
  });
  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: sent > 0, sent, total: results.length });
}
