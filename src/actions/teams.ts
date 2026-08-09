"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { teamSchema } from "@/lib/validation";

async function requireTenantAdmin() {
  const ctx = await requireTenant();
  if (!isAdminRole(ctx.user.role)) throw new Error("FORBIDDEN");
  return ctx;
}

export type TeamFormState = { error?: string };

export async function createTeamAction(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const { user, tenant } = await requireTenantAdmin();
  const parsed = teamSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    color: formData.get("color") || "#4f46e5",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }

  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      createdByUserId: user.id,
      tenantId: tenant.id,
    },
  });

  revalidatePath("/admin/teams");
  redirect(`/admin/teams/${team.id}`);
}

/** Rename/edit a team (name + description) — admin-only, tenant-scoped. */
export async function updateTeamAction(
  teamId: string,
  input: { name: string; description: string }
): Promise<{ ok?: boolean; error?: string }> {
  const { tenant } = await requireTenantAdmin();
  const parsed = teamSchema
    .pick({ name: true, description: true })
    .safeParse(input);
  if (!parsed.success) return { error: "EMPTY_NAME" };
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.tenantId !== tenant.id) return { error: "NOT_FOUND" };

  await prisma.team.update({
    where: { id: teamId },
    data: { name: parsed.data.name, description: parsed.data.description || null },
  });
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}

export async function deleteTeamAction(teamId: string): Promise<void> {
  const { tenant } = await requireTenantAdmin();
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

export async function addTeamMemberAction(
  teamId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const { tenant } = await requireTenantAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "NO_USER" };

  // Both the team and the member must belong to the active tenant.
  const [team, member] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!team || team.tenantId !== tenant.id) return { error: "NOT_FOUND" };
  if (!member || member.tenantId !== tenant.id) return { error: "NOT_FOUND" };

  await prisma.teamMember
    .create({ data: { teamId, userId } })
    .catch(() => {}); // ignore duplicate

  revalidatePath(`/admin/teams/${teamId}`);
  return {};
}

export async function removeTeamMemberAction(
  teamId: string,
  userId: string
): Promise<{ ok: boolean }> {
  const { tenant } = await requireTenantAdmin();
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.tenantId !== tenant.id) return { ok: false };
  await prisma.teamMember
    .deleteMany({ where: { teamId, userId } })
    .catch(() => {});
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}
