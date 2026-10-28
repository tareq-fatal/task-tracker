import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getCurrentUser, type SessionUser } from "./auth";
import { tenantSlugToTry } from "./tenant-decision";

export const TENANT_COOKIE = "tt_tenant";

export type ActiveTenant = {
  id: string;
  slug: string;
  name: string;
  // Branding: resolveBranding() needs ALL FOUR of these — keep them in the
  // type so a future `select` on getActiveTenant can't silently drop them.
  themeName: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logo: string | null;
  billingEnabled: boolean;
  parentTasksEnabled: boolean;
  storyPointsEnabled: boolean;
  translationEnabled: boolean;
  notificationRetentionDays: number;
};

export function setTenantCookie(slug: string): void {
  cookies().set(TENANT_COOKIE, slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

/**
 * Resolve the tenant the current request operates in.
 * - SuperAdmin: the cookie-selected tenant (or their own as fallback).
 * - Everyone else: HARD-LOCKED to their own tenant (cookie is ignored).
 * This is the single source of truth for tenant scoping.
 */
export async function getActiveTenant(): Promise<{
  user: SessionUser;
  tenant: ActiveTenant;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  // Decision extracted into a pure function (tenant-decision.ts, tested in
  // tenant-isolation.test.ts) — non-superusers always get null here.
  const slug = tenantSlugToTry(user, cookies().get(TENANT_COOKIE)?.value);
  if (slug) {
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (t) return { user, tenant: t };
  }

  const own = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  // own tenant always exists (FK); non-null assertion is safe
  return { user, tenant: own! };
}

export async function requireTenant(): Promise<{
  user: SessionUser;
  tenant: ActiveTenant;
}> {
  const ctx = await getActiveTenant();
  if (!ctx) throw new Error("UNAUTHORIZED");
  return ctx;
}

/** All tenants — only meaningful for the SuperAdmin switcher. */
export async function listTenants(): Promise<ActiveTenant[]> {
  return prisma.tenant.findMany({ orderBy: { name: "asc" } });
}
