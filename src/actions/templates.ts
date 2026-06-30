"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isTaskType, isTaskPriority } from "@/lib/enums";
import { applyAutomations } from "@/lib/automation-run";

export type TemplateState = { ok?: boolean; error?: string };
export type TemplateLite = {
  id: string; name: string; title: string; description: string | null;
  type: string; priority: string; storyPoints: number | null; subtasks: string[];
};

async function requireAdmin() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return { user, tenant };
}

function parseSubtasks(json: string | null): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getTemplates(): Promise<TemplateLite[]> {
  const { tenant } = await requireTenant();
  const rows = await prisma.taskTemplate.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id, name: r.name, title: r.title, description: r.description,
    type: r.type, priority: r.priority, storyPoints: r.storyPoints, subtasks: parseSubtasks(r.subtasks),
  }));
}

export async function addTemplateAction(input: {
  name: string; title: string; description?: string; type: string; priority: string; storyPoints?: number | null; subtasksText?: string;
}): Promise<TemplateState> {
  const { tenant } = await requireAdmin();
  const name = input.name.trim();
  const title = input.title.trim();
  if (!name || !title) return { error: "EMPTY" };
  if (!isTaskType(input.type)) return { error: "BAD_TYPE" };
  if (!isTaskPriority(input.priority)) return { error: "BAD_PRIORITY" };
  const subtasks = (input.subtasksText ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  await prisma.taskTemplate.create({
    data: {
      tenantId: tenant.id, name, title, description: input.description?.trim() || null,
      type: input.type, priority: input.priority, storyPoints: input.storyPoints ?? null,
      subtasks: subtasks.length ? JSON.stringify(subtasks) : null,
    },
  });
  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function deleteTemplateAction(id: string): Promise<TemplateState> {
  const { tenant } = await requireAdmin();
  const tpl = await prisma.taskTemplate.findFirst({ where: { id, tenantId: tenant.id } });
  if (!tpl) return { error: "NOT_FOUND" };
  await prisma.taskTemplate.delete({ where: { id } });
  revalidatePath("/admin/templates");
  return { ok: true };
}

/** Instantiate a task from a template (any authenticated user). Redirects to it. */
export async function createFromTemplateAction(id: string): Promise<TemplateState> {
  const { user, tenant } = await requireTenant();
  const tpl = await prisma.taskTemplate.findFirst({ where: { id, tenantId: tenant.id } });
  if (!tpl) return { error: "NOT_FOUND" };

  const subtasks = parseSubtasks(tpl.subtasks);
  const task = await prisma.task.create({
    data: {
      title: tpl.title, description: tpl.description, type: tpl.type, priority: tpl.priority,
      storyPoints: tpl.storyPoints, status: "Todo",
      assignedToUserId: user.id, createdByUserId: user.id, tenantId: tenant.id,
      subtasks: subtasks.length ? { create: subtasks.map((title, i) => ({ title, order: i })) } : undefined,
    },
  });
  await applyAutomations(tenant.id, task.id, { type: "created", projectId: null });
  redirect(`/tasks/${task.id}`);
}
