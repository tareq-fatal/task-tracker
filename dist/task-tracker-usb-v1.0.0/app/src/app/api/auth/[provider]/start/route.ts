import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  buildAuthorizeUrl,
  isProviderConfigured,
  isSsoProvider,
} from "@/lib/sso";

const STATE_COOKIE = "tt_sso_state";

// GET /api/auth/{provider}/start — kick off the OAuth authorization-code flow.
export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  if (!isSsoProvider(provider) || !isProviderConfigured(provider)) {
    return NextResponse.redirect(new URL("/login?sso=unavailable", req.url));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL(`/api/auth/${provider}/callback`, req.url).toString();
  const authorizeUrl = buildAuthorizeUrl(provider, { redirectUri, state });

  const res = NextResponse.redirect(authorizeUrl);
  // Bind the state to this browser for CSRF protection; also remember which
  // provider we started so the callback can read it.
  res.cookies.set(STATE_COOKIE, `${provider}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });
  return res;
}
