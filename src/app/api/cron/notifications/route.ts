import { NextRequest, NextResponse } from "next/server";
import { runDueReminders } from "@/lib/notification-cron";
import { requireSyncSecret } from "@/lib/cron-auth";

// Daily reminder cron (due-soon + overdue), SYNC_SECRET-guarded:
//   0 7 * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/notifications
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const denied = requireSyncSecret(req, "cron-notifications");
  if (denied) return denied;
  const result = await runDueReminders();
  return NextResponse.json({ ok: true, ...result });
}
