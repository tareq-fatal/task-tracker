import { NextRequest, NextResponse } from "next/server";
import { runPendingExports } from "@/lib/export-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drains the async export queue. Call periodically from an external scheduler,
// guarded by SYNC_SECRET (reused from Planner sync):
//   */2 * * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/exports
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
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 5;
  const result = await runPendingExports(limit);
  return NextResponse.json({
    ok: true,
    processed: result.processed,
    succeeded: result.ok,
    failed: result.failed,
  });
}
