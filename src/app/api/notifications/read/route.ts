import { NextRequest, NextResponse } from "next/server";
import { markReadAction, markAllReadAction } from "@/actions/notifications";

// POST /api/notifications/read
//   body { "id": "<notificationId>" }  → mark that one read
//   body {} or { "all": true }          → mark all read
export async function POST(req: NextRequest) {
  let body: { id?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty / non-JSON body → treat as "mark all"
  }
  try {
    if (body.id) {
      await markReadAction(body.id);
    } else {
      await markAllReadAction();
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
