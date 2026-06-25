import { NextRequest, NextResponse } from "next/server";
import { runDueSyncs } from "@/lib/planner-sync-runner";

// Cron entry point for continuous Planner sync. Call this every few minutes from
// an external scheduler (system cron / GitHub Actions / uptime pinger), e.g.:
//   */5 * * * *  curl -s -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/sync/planner
// Guarded by the SYNC_SECRET env var so it can't be triggered by the public.
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "sync disabled (no SYNC_SECRET)" }, { status: 503 });
  }
  if (req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDueSyncs();
  return NextResponse.json({ ok: true, ...result });
}
