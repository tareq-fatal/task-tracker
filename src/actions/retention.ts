"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { can } from "@/lib/roles";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  clampRetentionDays,
  retentionCutoff,
} from "@/lib/retention-policy";

export type RetentionState = { ok?: boolean; error?: string; deleted?: number };

async function requireTenantAdmin() {
  const ctx = await requireTenant();
  if (!isAdminRole(ctx.user.role)) throw new Error("FORBIDDEN");
  return ctx;
}

/** Admin: purge tenant notifications — "old" respects the configured
 *  retention, "all" is the emergency wipe behind the red button. */
export async function purgeNotificationsAction(mode: "old" | "all"): Promise<RetentionState> {
  const { tenant } = await requireTenantAdmin();
  const res = await prisma.notification.deleteMany({
    where: {
      tenantId: tenant.id,
      ...(mode === "old"
        ? { createdAt: { lt: retentionCutoff(clampRetentionDays(tenant.notificationRetentionDays)) } }
        : {}),
    },
  });
  revalidatePath("/admin/notifications");
  return { ok: true, deleted: res.count };
}

/** Admin: same pair for the activity log shown on /admin/activity.
 *  ActivityLog has no tenantId column — scoped via the owning task. */
export async function purgeActivityAction(mode: "old" | "all"): Promise<RetentionState> {
  const { tenant } = await requireTenantAdmin();
  const res = await prisma.activityLog.deleteMany({
    where: {
      task: { tenantId: tenant.id },
      ...(mode === "old"
        ? { createdAt: { lt: retentionCutoff(clampRetentionDays(tenant.notificationRetentionDays)) } }
        : {}),
    },
  });
  revalidatePath("/admin/activity");
  return { ok: true, deleted: res.count };
}

export async function setNotificationRetentionAction(days: number): Promise<RetentionState> {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "editTenantSettings")) throw new Error("FORBIDDEN");
  const n = Number(days);
  if (!Number.isInteger(n) || n < MIN_RETENTION_DAYS || n > MAX_RETENTION_DAYS) {
    return { error: "BAD_DAYS" };
  }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { notificationRetentionDays: n },
  });
  revalidatePath("/settings");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/activity");
  return { ok: true };
}
