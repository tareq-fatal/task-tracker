import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./prisma";
import type { Role } from "./enums";
import { isAdminRole } from "./enums";
import { cookieSecure } from "./cookie-security";

export const SESSION_COOKIE = "tt_session";
export const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** Create a DB session row and return the token + expiry (no cookie side-effect).
 *  Used by OAuth callback route handlers that set the cookie on a NextResponse. */
export async function createSessionToken(
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

/** Create a DB session row and set the httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSessionToken(userId);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(), // TOF-0794: COOKIE_SECURE, sonst wie bisher
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  cookies().delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  email: string | null; // #31 — optional
  role: Role;
  avatar: string | null;
  locale: string;
  hasSeenTour: boolean;
  onboardedAt: Date | null;
  mustChangePassword: boolean;
  tenantId: string;
  tenantSlug: string;
};

/** Returns the current user or null. Also refreshes lastActiveAt. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { tenant: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // Deactivated users have no valid session, even a pre-existing one.
  if (session.user.deactivatedAt) return null;

  // best-effort activity timestamp (don't block auth on it)
  prisma.user
    .update({
      where: { id: session.userId },
      data: { lastActiveAt: new Date() },
    })
    .catch(() => {});

  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role as Role,
    avatar: u.avatar,
    locale: u.locale,
    hasSeenTour: u.hasSeenTour,
    onboardedAt: u.onboardedAt,
    mustChangePassword: u.mustChangePassword,
    tenantId: u.tenantId,
    tenantSlug: u.tenant.slug,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminRole(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
