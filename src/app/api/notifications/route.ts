import { NextRequest, NextResponse } from "next/server";
import { getNotifications } from "@/actions/notifications";

// GET /api/notifications?limit=20 — current user's latest notifications + unread count.
// Session-cookie auth (same as the server action); server-action path is the primary
// consumer, this REST surface mirrors it for external/native clients.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("limit");
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const limit = Number.isFinite(parsed) ? parsed : 20;
  try {
    const data = await getNotifications(limit);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
