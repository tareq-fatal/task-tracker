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
};

async function requireAdmin() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return { user, tenant };
}

/** Tenant-wide custom field definitions (projectId = null), ordered. */
export async function getFieldDefs(): Promise<FieldDefLite[]> {
  const { tenant } = await requireTenant();
  const defs = await prisma.customFieldDef.findMany({
    where: { tenantId: tenant.id, projectId: null },
    orderBy: { order: "asc" },
  });
  return defs.map((d) => ({
    id: d.id, name: d.name, type: d.type as FieldType, options: parseOptions(d.options), order: d.order, required: d.required,
  }));
}

export async function addFieldDefAction(name: string, type: string, options: string[]): Promise<FieldState> {
  const { tenant } = await requireAdmin();
  const clean = name.trim();
  if (!clean) return { error: "EMPTY" };
  if (!isFieldType(type)) return { error: "BAD_TYPE" };
  const opts = type === "select" ? options.map((o) => o.trim()).filter(Boolean) : [];
  if (type === "select" && opts.length === 0) return { error: "NEED_OPTIONS" };
  const max = await prisma.customFieldDef.aggregate({ where: { tenantId: tenant.id, projectId: null }, _max: { order: true } });
  await prisma.customFieldDef.create({
    data: { tenantId: tenant.id, name: clean, type, options: opts.length ? JSON.stringify(opts) : null, order: (max._max.order ?? -1) + 1 },
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

/** Set (or clear) a custom field value on a task. Requires task-edit access. */
export async function setFieldValueAction(taskId: string, fieldId: string, raw: string): Promise<FieldState> {
  const { user, tenant } = await requireTenant();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.tenantId !== tenant.id) return { error: "NOT_FOUND" };
  // #36 — custom fields are content: only the creator or an admin may change them.
  if (!canEditTaskContent(user, task)) return { error: "FORBIDDEN" };

  const def = await prisma.customFieldDef.findFirst({ where: { id: fieldId, tenantId: tenant.id } });
  if (!def) return { error: "NOT_FOUND" };

  const check = validateValue(def.type as FieldType, raw, parseOptions(def.options));
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
