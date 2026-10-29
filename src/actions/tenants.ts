"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireTenant, setTenantCookie } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { isTenantFeature } from "@/lib/tenant-features";
import { parseTenantInput } from "@/lib/tenant-input";

export type TenantState = { ok?: boolean; error?: string; slug?: string };
export type TenantRow = { id: string; slug: string; name: string; primaryColor: string | null; users: number; tasks: number; projects: number; openTasks: number; leads: number; billingEnabled: boolean; parentTasksEnabled: boolean; storyPointsEnabled: boolean; translationEnabled: boolean };

async function requireSuper() {
  const { user } = await requireTenant();
  if (!can(user.role, "manageTenants")) throw new Error("FORBIDDEN");
  return user;
}

export async function getTenants(): Promise<TenantRow[]> {
  await requireSuper();
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true, tasks: { where: { deletedAt: null } }, projects: { where: { deletedAt: null } }, leads: { where: { archivedAt: null } } } } },
  });
  // TOF-0788: offene Aufgaben je Mandant (Todo + InProgress, nicht gelöscht) für die Übersicht.
  const open = await prisma.task.groupBy({
    by: ["tenantId"],
    where: { deletedAt: null, status: { in: ["Todo", "InProgress"] } },
    _count: { _all: true },
  });
  const openBy = new Map(open.map((o) => [o.tenantId, o._count._all]));
  return tenants.map((t) => ({
    id: t.id, slug: t.slug, name: t.name, primaryColor: t.primaryColor,
    users: t._count.users, tasks: t._count.tasks, projects: t._count.projects,
    openTasks: openBy.get(t.id) ?? 0, leads: t._count.leads,
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

/** Onboard a new customer: create an empty tenant + (optionally) its first TenantAdmin.
 *  TOF-0783 (Tarek 28.10.2026): owner is OPTIONAL — all owner fields empty →
 *  only the tenant is created; the Superuser switches into it and invites the
 *  users by link. With an owner, behaviour is unchanged. Validation lives in
 *  lib/tenant-input.ts (unit-tested). */
export async function createTenantAction(input: {
  name: string; slug: string; primaryColor?: string;
  ownerName?: string; ownerUsername?: string; ownerEmail?: string; ownerPassword?: string;
}): Promise<TenantState> {
  await requireSuper();

  const parsed = parseTenantInput(input);
  if (!parsed.ok) return { error: parsed.error };
  const { name, slug, primaryColor, owner } = parsed;

  if (await prisma.tenant.findUnique({ where: { slug } })) return { error: "SLUG_TAKEN" };
  if (owner && (await prisma.user.findUnique({ where: { username: owner.username } }))) return { error: "USERNAME_TAKEN" };

  const passwordHash = owner ? await hashPassword(owner.password) : null;
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { slug, name, primaryColor },
    });
    if (owner && passwordHash) {
      await tx.user.create({
        data: {
          name: owner.name, username: owner.username, email: owner.email, passwordHash,
          role: "Admin", tenantId: tenant.id, locale: "de", hasSeenTour: false,
        },
      });
    }
  });

  // auto-switch the SuperAdmin into the freshly created tenant so they can set
  // it up immediately (projects/users). The owner gets the welcome tour on their
  // own first login (hasSeenTour=false).
  setTenantCookie(slug);
  revalidatePath("/", "layout");
  return { ok: true, slug };
}
