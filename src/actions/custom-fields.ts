"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { canEditTaskContent } from "@/lib/task-access";
import { isFieldType, parseOptions, validateValue, type FieldType } from "@/lib/custom-fields";

export type FieldState = { ok?: boolean; error?: string };

export type FieldDefLite = {
  id: string; name: string; type: FieldType; options: string[]; order: number; required: boolean;
  projectId: string | null;
};

async function requireAdmin() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return { user, tenant };
}

/** Normalize a raw project scope: "" / undefined → null (tenant-wide). */
function normScope(projectId?: string | null): string | null {
  const p = (projectId ?? "").trim();
  return p === "" ? null : p;
}

function toLite(d: {
  id: string; name: string; type: string; options: string | null; order: number; required: boolean; projectId: string | null;
}): FieldDefLite {
  return {
    id: d.id, name: d.name, type: d.type as FieldType, options: parseOptions(d.options),
    order: d.order, required: d.required, projectId: d.projectId,
  };
}

/**
 * Field definitions for one scope, ordered. `projectId = null` returns the
 * tenant-wide fields; a project id returns that project's own fields only.
 */
export async function getFieldDefs(projectId?: string | null): Promise<FieldDefLite[]> {
  const { tenant } = await requireTenant();
  const scope = normScope(projectId);
  const defs = await prisma.customFieldDef.findMany({
    where: { tenantId: tenant.id, projectId: scope },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return defs.map(toLite);
}

export async function addFieldDefAction(
  name: string, type: string, options: string[], projectId?: string | null
): Promise<FieldState> {
  const { tenant } = await requireAdmin();
  const clean = name.trim();
  if (!clean) return { error: "EMPTY" };
  if (!isFieldType(type)) return { error: "BAD_TYPE" };
  const scope = normScope(projectId);
  if (scope) {
    const proj = await prisma.project.findFirst({ where: { id: scope, tenantId: tenant.id }, select: { id: true } });
    if (!proj) return { error: "BAD_PROJECT" };
  }
  const opts = type === "select" ? options.map((o) => o.trim()).filter(Boolean) : [];
  if (type === "select" && opts.length === 0) return { error: "NEED_OPTIONS" };
  const max = await prisma.customFieldDef.aggregate({
    where: { tenantId: tenant.id, projectId: scope }, _max: { order: true },
  });
  await prisma.customFieldDef.create({
    data: {
      tenantId: tenant.id, projectId: scope, name: clean, type,
      options: opts.length ? JSON.stringify(opts) : null, order: (max._max.order ?? -1) + 1,
    },
  });
  revalidatePath("/admin/custom-fields");
  return { ok: true };
}

export async function deleteFieldDefAction(id: string): Promise<FieldState> {
  const { tenant } = await requireAdmin();
  const def = await prisma.customFieldDef.findFirst({ where: { id, tenantId: tenant.id } });
  if (!def) return { error: "NOT_FOUND" };
  await prisma.customFieldDef.delete({ where: { id } }); // cascades values
  revalidatePath("/admin/custom-fields");
  return { ok: true };
}

export async function toggleRequiredAction(id: string, required: boolean): Promise<FieldState> {
  const { tenant } = await requireAdmin();
  const def = await prisma.customFieldDef.findFirst({ where: { id, tenantId: tenant.id } });
  if (!def) return { error: "NOT_FOUND" };
  await prisma.customFieldDef.update({ where: { id }, data: { required } });
  revalidatePath("/admin/custom-fields");
  return { ok: true };
}

/**
 * Persist a new field order (drag-drop). `ids` is the full ordered list of one
 * scope's fields; each gets `order = index`. Ids not owned by the tenant are
 * ignored so a stale client can't reorder foreign fields.
 */
export async function reorderFieldDefsAction(ids: string[]): Promise<FieldState> {
  const { tenant } = await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0) return { error: "EMPTY" };
  const owned = await prisma.customFieldDef.findMany({
    where: { id: { in: ids }, tenantId: tenant.id }, select: { id: true },
  });
  const ownedIds = new Set(owned.map((d) => d.id));
  const ordered = ids.filter((id) => ownedIds.has(id));
  await prisma.$transaction(
    ordered.map((id, i) => prisma.customFieldDef.update({ where: { id }, data: { order: i } }))
  );
  revalidatePath("/admin/custom-fields");
  return { ok: true };
}

/** Set (or clear) a custom field value on a task. Requires task-edit access. */
export async function setFieldValueAction(taskId: string, fieldId: string, raw: string): Promise<FieldState> {
  const { user, tenant } = await requireTenant();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.tenantId !== tenant.id) return { error: "NOT_FOUND" };
  // #36 — custom fields are content: only the creator or an admin may change them.
  if (!canEditTaskContent(user, task)) return { error: "FORBIDDEN" };

  const def = await prisma.customFieldDef.findFirst({ where: { id: fieldId, tenantId: tenant.id } });
  if (!def) return { error: "NOT_FOUND" };
  // A project-scoped field only applies to tasks of that project.
  if (def.projectId && def.projectId !== task.projectId) return { error: "WRONG_PROJECT" };

  // `user` fields validate the id against the tenant's members; `select` against its options.
  let allowed = parseOptions(def.options);
  if (def.type === "user") {
    const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    allowed = users.map((u) => u.id);
  }
  const check = validateValue(def.type as FieldType, raw, allowed);
  if (!check.ok) return { error: check.error };

  if (check.value === "") {
    await prisma.customFieldValue.deleteMany({ where: { fieldId, taskId } });
  } else {
    await prisma.customFieldValue.upsert({
      where: { fieldId_taskId: { fieldId, taskId } },
      create: { fieldId, taskId, value: check.value! },
      update: { value: check.value! },
    });
  }
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
