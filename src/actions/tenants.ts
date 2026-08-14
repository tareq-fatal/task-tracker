"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireTenant, setTenantCookie } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { isTenantFeature } from "@/lib/tenant-features";

export type TenantState = { ok?: boolean; error?: string; slug?: string };
export type TenantRow = { id: string; slug: string; name: string; primaryColor: string | null; users: number; tasks: number; projects: number; billingEnabled: boolean; parentTasksEnabled: boolean; storyPointsEnabled: boolean; translationEnabled: boolean };

async function requireSuper() {
  const { user } = await requireTenant();
  if (!can(user.role, "manageTenants")) throw new Error("FORBIDDEN");
  return user;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

export async function getTenants(): Promise<TenantRow[]> {
  await requireSuper();
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true, tasks: { where: { deletedAt: null } }, projects: { where: { deletedAt: null } } } } },
  });
  return tenants.map((t) => ({
    id: t.id, slug: t.slug, name: t.name, primaryColor: t.primaryColor,
    users: t._count.users, tasks: t._count.tasks, projects: t._count.projects,
    billingEnabled: t.billingEnabled,
    parentTasksEnabled: t.parentTasksEnabled,
    storyPointsEnabled: t.storyPointsEnabled,
    translationEnabled: t.translationEnabled,
  }));
}

/** BackendAdmin-only: flip one whitelisted per-tenant feature flag. Takes
 *  effect on the next render — no restart needed. */
export async function setTenantFeatureAction(
  tenantId: string,
  feature: string,
  enabled: boolean
): Promise<TenantState> {
  await requireSuper();
  if (!isTenantFeature(feature)) return { error: "BAD_FEATURE" };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { [feature]: enabled },
  });
  revalidatePath("/admin/mandanten");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** BackendAdmin-only feature flag: billable/non-billable UI per tenant.
 *  Takes effect on the next render — no restart needed. */
export async function setTenantBillingAction(
  tenantId: string,
  enabled: boolean
): Promise<TenantState> {
  await requireSuper();
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { billingEnabled: enabled },
  });
  revalidatePath("/admin/mandanten");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** BackendAdmin-only: rename a Mandant — DISPLAY NAME ONLY.
 *
 *  The slug stays frozen on purpose: it is the tenant's identity everywhere —
 *  the switch cookie (tt_tenant), /t/{slug} deep links, upload paths
 *  (/uploads/tenants/{slug}/logo.*), session tokens, webhook + audit payloads
 *  and generated usernames (import/SSO). Renaming it would orphan all of those.
 *  The name is display-only (header, login branding, exports, MCP identity) and
 *  is never used as a lookup key, so changing it is safe and takes effect on
 *  the next render. */
export async function renameTenantAction(
  tenantId: string,
  name: string
): Promise<TenantState> {
  const actor = await requireSuper();

  const next = name.trim();
  if (!next) return { error: "EMPTY" };
  if (next.length > 120) return { error: "TOO_LONG" };

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { error: "NOT_FOUND" };
  if (tenant.name === next) return { ok: true, slug: tenant.slug };

  await prisma.tenant.update({ where: { id: tenantId }, data: { name: next } });

  // Audit trail (same channel as tenant deletion).
  await prisma.dbAuditLog
    .create({
      data: {
        userId: actor.id,
        userName: actor.name,
        sql: `[RENAME TENANT] ${tenant.slug}: "${tenant.name}" -> "${next}"`,
        mode: "write",
        rowCount: 1,
      },
    })
    .catch(() => {});

  revalidatePath("/admin/mandanten");
  revalidatePath("/", "layout"); // header, branding and login page carry the name
  return { ok: true, slug: tenant.slug };
}

/** Onboard a new customer: create an empty tenant + its first TenantAdmin. */
export async function createTenantAction(input: {
  name: string; slug: string; primaryColor?: string;
  ownerName: string; ownerUsername: string; ownerEmail: string; ownerPassword: string;
}): Promise<TenantState> {
  await requireSuper();

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const ownerName = input.ownerName.trim();
  const ownerUsername = input.ownerUsername.trim().toLowerCase();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();

  if (!name || !ownerName) return { error: "EMPTY" };
  if (!SLUG_RE.test(slug)) return { error: "BAD_SLUG" };
  if (!/^[a-z0-9._-]{3,}$/.test(ownerUsername)) return { error: "BAD_USERNAME" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) return { error: "BAD_EMAIL" };
  if ((input.ownerPassword ?? "").length < 6) return { error: "WEAK_PASSWORD" };

  if (await prisma.tenant.findUnique({ where: { slug } })) return { error: "SLUG_TAKEN" };
  if (await prisma.user.findUnique({ where: { username: ownerUsername } })) return { error: "USERNAME_TAKEN" };

  const passwordHash = await hashPassword(input.ownerPassword);
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { slug, name, primaryColor: input.primaryColor || "#4f46e5" },
    });
    await tx.user.create({
      data: {
        name: ownerName, username: ownerUsername, email: ownerEmail, passwordHash,
        role: "Admin", tenantId: tenant.id, locale: "de", hasSeenTour: false,
      },
    });
  });

  // auto-switch the SuperAdmin into the freshly created tenant so they can set
  // it up immediately (projects/users). The owner gets the welcome tour on their
  // own first login (hasSeenTour=false).
  setTenantCookie(slug);
  revalidatePath("/", "layout");
  return { ok: true, slug };
}
