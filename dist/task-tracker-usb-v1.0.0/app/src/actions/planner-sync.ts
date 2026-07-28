"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { isGraphConfigured } from "@/lib/graph";
import { runPlannerSync } from "@/lib/planner-sync-runner";

export type PlannerSyncState = { ok?: boolean; error?: string; summary?: string };

export type PlannerSyncView = {
  graphConfigured: boolean;
  projects: Array<{
    id: string;
    name: string;
    sync: {
      id: string;
      planId: string;
      direction: string;
      enabled: boolean;
      lastSyncedAt: string | null;
      lastStatus: string | null;
    } | null;
  }>;
};

export async function getPlannerSyncView(): Promise<PlannerSyncView> {
  const { tenant } = await requireTenant();
  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
    include: { plannerSync: true },
  });
  return {
    graphConfigured: isGraphConfigured(),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      sync: p.plannerSync
        ? {
            id: p.plannerSync.id,
            planId: p.plannerSync.planId,
            direction: p.plannerSync.direction,
            enabled: p.plannerSync.enabled,
            lastSyncedAt: p.plannerSync.lastSyncedAt?.toISOString() ?? null,
            lastStatus: p.plannerSync.lastStatus,
          }
        : null,
    })),
  };
}

export async function linkPlannerPlanAction(
  _prev: PlannerSyncState,
  formData: FormData
): Promise<PlannerSyncState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };

  const projectId = formData.get("projectId")?.toString() ?? "";
  const planId = formData.get("planId")?.toString().trim() ?? "";
  const groupId = formData.get("groupId")?.toString().trim() || null;
  const direction = formData.get("direction")?.toString() ?? "pull";
  if (!projectId || !planId) return { error: "MISSING" };

  // project must belong to the active tenant (isolation)
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
  });
  if (!project) return { error: "NOT_FOUND" };

  await prisma.plannerSync.upsert({
    where: { projectId },
    update: { planId, groupId, direction, enabled: true },
    create: { tenantId: tenant.id, projectId, planId, groupId, direction },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function unlinkPlannerSyncAction(
  syncId: string
): Promise<PlannerSyncState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };
  // scope delete to the active tenant
  await prisma.plannerSync.deleteMany({ where: { id: syncId, tenantId: tenant.id } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function syncNowAction(syncId: string): Promise<PlannerSyncState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };
  const sync = await prisma.plannerSync.findFirst({
    where: { id: syncId, tenantId: tenant.id },
  });
  if (!sync) return { error: "NOT_FOUND" };
  const res = await runPlannerSync(syncId);
  revalidatePath("/settings");
  return res.ok ? { ok: true, summary: res.summary } : { error: res.summary };
}
