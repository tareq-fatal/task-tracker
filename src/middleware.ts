import { NextResponse, type NextRequest } from "next/server";

// Deep-link preservation (Telegram/push notification links): a logged-out
// visitor on a task/project URL is sent to login WITH the target as
// returnUrl, so after signing in they land on the task — not the dashboard.
// Cookie *existence* is all we check here; real session validation stays in
// the app layout. An expired cookie just means login shows up one hop later.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("tt_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?returnUrl=${encodeURIComponent(
      req.nextUrl.pathname + req.nextUrl.search
    )}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Only the deep-link targets notifications produce — everything else keeps
  // the existing layout-level redirect behavior.
  matcher: ["/tasks/:id+", "/projects/:id+"],
};
