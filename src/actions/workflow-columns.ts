"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { WORKFLOW_TEMPLATES, columnForStatus, type TemplateKey } from "@/lib/workflow";

export type ColumnState = { ok?: boolean; error?: string };

async function requireAdminProject(projectId: string) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) throw new Error("NOT_FOUND");
  return { user, tenant, project };
}

export type ColumnLite = {
  id: string; name: string; color: string; order: number;
  wipLimit: number | null; isInitial: boolean; isFinal: boolean; status: string; taskCount: number;
};

export async function getProjectColumns(projectId: string): Promise<ColumnLite[]> {
  const { tenant } = await requireTenant();
  const cols = await prisma.workflowColumn.findMany({
    where: { projectId, tenantId: tenant.id },
    orderBy: { order: "asc" },
    // filtered relation count — plain _count would include soft-deleted tasks
    // (nested counts bypass the client-extension guard in lib/prisma.ts)
    include: { _count: { select: { tasks: { where: { deletedAt: null } } } } },
  });
  return cols.map((c) => ({
    id: c.id, name: c.name, color: c.color, order: c.order,
    wipLimit: c.wipLimit, isInitial: c.isInitial, isFinal: c.isFinal, status: c.status,
    taskCount: c._count.tasks,
  }));
}

export async function addColumnAction(projectId: string, name: string): Promise<ColumnState> {
  const { tenant } = await requireAdminProject(projectId);
  const clean = name.trim();
  if (!clean) return { error: "EMPTY" };
  const max = await prisma.workflowColumn.aggregate({ where: { projectId, tenantId: tenant.id }, _max: { order: true } });
  await prisma.workflowColumn.create({
    data: { projectId, tenantId: tenant.id, name: clean, order: (max._max.order ?? -1) + 1, status: "InProgress" },
  });
  revalidatePath(`/projects/${projectId}/workflow`);
  return { ok: true };
}

export async function updateColumnAction(
  columnId: string,
  patch: { name?: string; color?: string; wipLimit?: number | null; status?: string; isInitial?: boolean; isFinal?: boolean }
): Promise<ColumnState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };
  const col = await prisma.workflowColumn.findFirst({ where: { id: columnId, tenantId: tenant.id } });
  if (!col) return { error: "NOT_FOUND" };

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) { const n = patch.name.trim(); if (!n) return { error: "EMPTY" }; data.name = n; }
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.wipLimit !== undefined) data.wipLimit = patch.wipLimit && patch.wipLimit > 0 ? patch.wipLimit : null;
  if (patch.status !== undefined) data.status = patch.status;
  // keep "initial"/"final" unique within the project
  if (patch.isInitial) await prisma.workflowColumn.updateMany({ where: { projectId: col.projectId, tenantId: tenant.id }, data: { isInitial: false } });
  if (patch.isFinal) await prisma.workflowColumn.updateMany({ where: { projectId: col.projectId, tenantId: tenant.id }, data: { isFinal: false } });
  if (patch.isInitial !== undefined) data.isInitial = patch.isInitial;
  if (patch.isFinal !== undefined) data.isFinal = patch.isFinal;

  await prisma.workflowColumn.update({ where: { id: columnId }, data });
  revalidatePath(`/projects/${col.projectId}/workflow`);
  return { ok: true };
}

export async function deleteColumnAction(columnId: string): Promise<ColumnState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };
  const col = await prisma.workflowColumn.findFirst({ where: { id: columnId, tenantId: tenant.id } });
  if (!col) return { error: "NOT_FOUND" };
  // tasks fall back to the status board (workflowColumnId → null via SetNull)
  await prisma.workflowColumn.delete({ where: { id: columnId } });
  revalidatePath(`/projects/${col.projectId}/workflow`);
  return { ok: true };
}

/** Move a column one slot up/down by swapping order with its neighbour. */
export async function moveColumnAction(columnId: string, dir: "up" | "down"): Promise<ColumnState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };
  const col = await prisma.workflowColumn.findFirst({ where: { id: columnId, tenantId: tenant.id } });
  if (!col) return { error: "NOT_FOUND" };
  const neighbour = await prisma.workflowColumn.findFirst({
    where: { projectId: col.projectId, tenantId: tenant.id, order: dir === "up" ? { lt: col.order } : { gt: col.order } },
    orderBy: { order: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return { ok: true }; // already at the edge
  await prisma.$transaction([
    prisma.workflowColumn.update({ where: { id: col.id }, data: { order: neighbour.order } }),
    prisma.workflowColumn.update({ where: { id: neighbour.id }, data: { order: col.order } }),
  ]);
  revalidatePath(`/projects/${col.projectId}/workflow`);
  return { ok: true };
}

/** Replace a project's columns with a template, and map existing tasks into the
 *  column matching their current status (keeps work in the right place). */
export async function applyTemplateAction(projectId: string, key: TemplateKey): Promise<ColumnState> {
  const { tenant } = await requireAdminProject(projectId);
  const tpl = WORKFLOW_TEMPLATES[key];
  if (!tpl) return { error: "BAD_TEMPLATE" };

  await prisma.workflowColumn.deleteMany({ where: { projectId, tenantId: tenant.id } });
  const created = [];
  for (let i = 0; i < tpl.columns.length; i++) {
    const c = tpl.columns[i];
    created.push(
      await prisma.workflowColumn.create({
        data: { projectId, tenantId: tenant.id, name: c.name, color: c.color, order: i, wipLimit: c.wipLimit ?? null, isInitial: !!c.isInitial, isFinal: !!c.isFinal, status: c.status },
      })
    );
  }

  // assign existing project tasks to the column matching their status
  const tasks = await prisma.task.findMany({ where: { projectId, tenantId: tenant.id }, select: { id: true, status: true } });
  for (const t of tasks) {
    const target = columnForStatus(created, t.status);
    if (target) await prisma.task.update({ where: { id: t.id }, data: { workflowColumnId: target.id } });
  }

  revalidatePath(`/projects/${projectId}/workflow`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
