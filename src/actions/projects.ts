"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { can } from "@/lib/roles";
import { projectSchema } from "@/lib/validation";

export type ProjectFormState = { error?: string };

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const { user, tenant } = await requireTenant();
  // #37 — only Mandant-/Backend-Admins may create projects. Users work inside
  // projects they're a member of, but can't spin up new ones.
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    color: formData.get("color") || "#6366f1",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      createdByUserId: user.id,
      tenantId: tenant.id,
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

/** Members of a project + the tenant users not yet on it (admin picker). */
export async function getProjectMembersView(projectId: string) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");

  const [members, allUsers] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, username: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  return {
    members: members.map((m) => m.user),
    candidates: allUsers.filter((u) => !memberIds.has(u.id)),
  };
}

export async function addProjectMemberAction(
  projectId: string,
  userId: string
): Promise<void> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  // target must belong to the same tenant (never grant cross-tenant access)
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== tenant.id) throw new Error("NOT_FOUND");

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId },
    update: {},
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectMemberAction(
  projectId: string,
  userId: string
): Promise<void> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");

  await prisma.projectMember
    .delete({ where: { projectId_userId: { projectId, userId } } })
    .catch(() => {}); // idempotent — already removed
  revalidatePath(`/projects/${projectId}`);
}

/** Counts shown in the delete-confirmation dialog. Admin-only. */
export async function getProjectDeleteStats(
  projectId: string
): Promise<{ tasks: number; comments: number; attachments: number }> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { tenantId: true } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  // tenantId is redundant once the project is tenant-checked above, but it keeps
  // a task that somehow carries a foreign tenantId out of the count — and out of
  // the cascade below (security audit 2026-07, defense in depth).
  const [tasks, comments, attachments] = await Promise.all([
    prisma.task.count({ where: { projectId, tenantId: tenant.id } }),
    prisma.taskComment.count({ where: { task: { projectId, tenantId: tenant.id, deletedAt: null } } }),
    prisma.taskAttachment.count({ where: { task: { projectId, tenantId: tenant.id, deletedAt: null } } }),
  ]);
  return { tasks, comments, attachments };
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  const { user, tenant } = await requireTenant();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  // #37 — deleting a project is admin-only (users can't create OR delete
  // projects); capability-gated so the rule is unit-testable (manageProjects).
  if (!can(user.role, "manageProjects")) throw new Error("FORBIDDEN");
  // SOFT delete, cascading to the project's live tasks with the SAME
  // timestamp — restore brings back exactly this set and nothing that was
  // deleted individually before.
  const ts = new Date();
  await prisma.task.updateMany({
    where: { projectId, tenantId: tenant.id, deletedAt: null },
    data: { deletedAt: ts, deletedBy: user.id },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: ts, deletedBy: user.id },
  });
  // Audit trail (same channel as tenant deletion).
  await prisma.dbAuditLog
    .create({
      data: {
        userId: user.id,
        userName: user.name,
        sql: `[DELETE PROJECT] ${project.name} (${projectId}) in tenant ${tenant.slug}`,
        mode: "write",
      },
    })
    .catch(() => {});
  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}

/** Undo a project soft delete — restores the project AND exactly the tasks
 *  that were cascade-deleted with it (matched by the shared timestamp). */
export async function restoreProjectAction(projectId: string): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!project.deletedAt) return { ok: true };
  await prisma.task.updateMany({
    where: { projectId, tenantId: tenant.id, deletedAt: project.deletedAt },
    data: { deletedAt: null, deletedBy: null },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: null, deletedBy: null },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
