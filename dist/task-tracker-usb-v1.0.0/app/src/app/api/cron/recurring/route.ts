import { NextRequest, NextResponse } from "next/server";
import { runDueRecurring } from "@/lib/recurring-runner";

// Cron entry for recurring tasks. Spawns every due series instance and advances
// its schedule (honouring pause, end-count, until-date). Guarded by SYNC_SECRET
// (reused from Planner sync). Call it frequently — every 5 minutes — so custom
// cron schedules ("0 9 * * 1-5") fire close to their intended minute:
//   */5 * * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/recurring
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "disabled (no SYNC_SECRET)" }, { status: 503 });
  }
  if (req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDueRecurring();
  return NextResponse.json({ ok: true, ...result });
}
