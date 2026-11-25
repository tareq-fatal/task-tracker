import { NextRequest, NextResponse } from "next/server";
import { runNotificationRetention } from "@/lib/notification-retention";
import { withAllProjects } from "@/lib/project-visibility/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily retention sweep: deletes notifications + activity-log entries older
// than each tenant's notificationRetentionDays. Call from an external
// scheduler, guarded by SYNC_SECRET (reused from Planner sync):
//   15 3 * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/notification-retention
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
  // TOF-0966/0967: System-Job — läuft für ALLE Projekte (Verborgen/Anzeige-Ebene egal).
  const result = await withAllProjects(() => runNotificationRetention());
  return NextResponse.json({ ok: true, ...result });
}
