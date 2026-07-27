import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getCurrentUser, type SessionUser } from "./auth";
import { isSuperAdmin } from "./enums";

export const TENANT_COOKIE = "tt_tenant";

export type ActiveTenant = {
  id: string;
  slug: string;
  name: string;
  primaryColor: string | null;
  logo: string | null;
  billingEnabled: boolean;
  parentTasksEnabled: boolean;
  storyPointsEnabled: boolean;
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

  if (isSuperAdmin(user.role)) {
    const slug = cookies().get(TENANT_COOKIE)?.value;
    if (slug) {
      const t = await prisma.tenant.findUnique({ where: { slug } });
      if (t) return { user, tenant: t };
    }
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
