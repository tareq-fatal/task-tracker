import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// Hard GET logout — a plain navigation that works reliably inside the Capacitor
// WebView (server-action form posts were being swallowed in the APK).
export async function GET(req: Request) {
  await destroySession();
  const url = new URL("/login", req.url);
  const res = NextResponse.redirect(url, { status: 303 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
