import { NextRequest, NextResponse } from "next/server";
import { runDueReminders } from "@/lib/notification-cron";

// Daily reminder cron (due-soon + overdue), SYNC_SECRET-guarded:
//   0 7 * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/notifications
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "disabled (no SYNC_SECRET)" }, { status: 503 });
  if (req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDueReminders();
  return NextResponse.json({ ok: true, ...result });
}
