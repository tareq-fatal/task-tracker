"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { projectSchema } from "@/lib/validation";

export type ProjectFormState = { error?: string };

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const { user, tenant } = await requireTenant();
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

export async function deleteProjectAction(projectId: string): Promise<void> {
  const { user, tenant } = await requireTenant();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!isAdminRole(user.role) && project.createdByUserId !== user.id) {
    throw new Error("FORBIDDEN");
  }
  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/projects");
  redirect("/projects");
}
