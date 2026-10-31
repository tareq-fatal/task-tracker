import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";
import { cookieSecure } from "@/lib/cookie-security";
import {
  exchangeCode,
  fetchUserInfo,
  emailMatchesDomains,
  isProviderConfigured,
  isSsoProvider,
  type SsoProvider,
} from "@/lib/sso";
import { publicOrigin } from "@/lib/public-origin";

const STATE_COOKIE = "tt_sso_state";

function fail(req: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/login?sso=${reason}`, publicOrigin(req)));
}

async function readParams(req: NextRequest) {
  if (req.method === "POST") {
    // Apple uses response_mode=form_post
    const form = await req.formData();
    return {
      code: form.get("code")?.toString() ?? "",
      state: form.get("state")?.toString() ?? "",
    };
  }
  const sp = req.nextUrl.searchParams;
  return { code: sp.get("code") ?? "", state: sp.get("state") ?? "" };
}

async function handle(
  req: NextRequest,
  provider: string
): Promise<NextResponse> {
  if (!isSsoProvider(provider) || !isProviderConfigured(provider)) {
    return fail(req, "unavailable");
  }

  const { code, state } = await readParams(req);
  const stateCookie = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const [cookieProvider, cookieState] = stateCookie.split(":");
  if (!code || !state || cookieProvider !== provider || cookieState !== state) {
    return fail(req, "state");
  }

  const redirectUri = new URL(
    `/api/auth/${provider}/callback`,
    publicOrigin(req)
  ).toString();

  let sso;
  try {
    const tokens = await exchangeCode(provider as SsoProvider, code, redirectUri);
    sso = await fetchUserInfo(provider as SsoProvider, tokens);
  } catch {
    return fail(req, "exchange");
  }
  if (!sso.sub || !sso.email) return fail(req, "profile");
  const email = sso.email.toLowerCase();

  // 1. Returning user — identity already linked.
  let user = (
    await prisma.userIdentity.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId: sso.sub },
      },
      include: { user: true },
    })
  )?.user;

  if (!user) {
    // 2. Route to a tenant by email domain.
    const tenants = await prisma.tenant.findMany({
      where: { ssoDomains: { not: null } },
    });
    // Fail CLOSED when more than one tenant claims this domain. `findMany` has
    // no ordering, so picking the first match would hand the user to a
    // non-deterministic tenant — and to whichever one claimed the domain last
    // (security audit 2026-07). saveTenantSsoAction now rejects new collisions;
    // this guards the ones that may already exist in the database.
    const matches = tenants.filter((t) => emailMatchesDomains(email, t.ssoDomains));
    if (matches.length > 1) return fail(req, "ambiguous_tenant");
    const tenant = matches[0];
    if (!tenant) return fail(req, "no_tenant");

    // 3. Provider must be enabled for that tenant.
    const cfg = await prisma.tenantAuthProvider.findUnique({
      where: { tenantId_provider: { tenantId: tenant.id, provider } },
    });
    if (!cfg || !cfg.enabled) return fail(req, "disabled");

    // 4. Existing local account in the tenant → link it.
    user =
      (await prisma.user.findFirst({
        where: { email, tenantId: tenant.id },
      })) ?? undefined;

    // 5. Otherwise auto-provision (when allowed).
    if (!user) {
      if (!cfg.autoProvision) return fail(req, "no_account");
      const username = await uniqueUsername(email, tenant.slug);
      user = await prisma.user.create({
        data: {
          name: sso.name || email,
          username,
          email,
          passwordHash: await hash(randomBytes(24).toString("hex")),
          role: "User",
          locale: "de",
          hasSeenTour: false,
          tenantId: tenant.id,
        },
      });
    }

    await prisma.userIdentity.create({
      data: { userId: user.id, provider, providerAccountId: sso.sub },
    });
  }

  // Issue our own session and clear the state cookie.
  const { token, expiresAt } = await createSessionToken(user.id);
  const res = NextResponse.redirect(new URL("/", publicOrigin(req)));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(), // TOF-0794: COOKIE_SECURE, sonst wie bisher
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

async function uniqueUsername(email: string, tenantSlug: string) {
  const base = `${email.split("@")[0]}.${tenantSlug}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const exists = await prisma.user.findUnique({
      where: { username: candidate },
    });
    if (!exists) return candidate;
    candidate = `${base}${i + 1}`;
  }
  return `${base}.${randomBytes(3).toString("hex")}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  return handle(req, params.provider);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  return handle(req, params.provider);
}
