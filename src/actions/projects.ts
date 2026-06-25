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
