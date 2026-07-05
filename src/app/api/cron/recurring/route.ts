import { NextRequest, NextResponse } from "next/server";
import { runDueRecurring } from "@/lib/recurring-runner";
import { requireSyncSecret } from "@/lib/cron-auth";

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
  const denied = requireSyncSecret(req, "cron-recurring");
  if (denied) return denied;
  const result = await runDueRecurring();
  return NextResponse.json({ ok: true, ...result });
}
