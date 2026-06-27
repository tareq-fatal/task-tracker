import { NextRequest, NextResponse } from "next/server";
import { runDueRecurring } from "@/lib/recurring-runner";

// Cron entry for recurring tasks. Call every few hours from an external
// scheduler, guarded by SYNC_SECRET (reused from Planner sync):
//   0 */6 * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/recurring
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
