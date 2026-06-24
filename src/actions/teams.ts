"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { teamSchema } from "@/lib/validation";

export type TeamFormState = { error?: string };

export async function createTeamAction(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const parsed = teamSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    color: formData.get("color") || "#0ea5e9",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }

  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      createdByUserId: admin.id,
    },
  });

  revalidatePath("/admin/teams");
  redirect(`/admin/teams/${team.id}`);
}

export async function deleteTeamAction(teamId: string): Promise<void> {
  await requireAdmin();
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

export async function addTeamMemberAction(
  teamId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "NO_USER" };

  await prisma.teamMember
    .create({ data: { teamId, userId } })
    .catch(() => {}); // ignore duplicate (unique constraint)

  revalidatePath(`/admin/teams/${teamId}`);
  return {};
}

export async function removeTeamMemberAction(
  teamId: string,
  userId: string
): Promise<{ ok: boolean }> {
  await requireAdmin();
  await prisma.teamMember
    .deleteMany({ where: { teamId, userId } })
    .catch(() => {});
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}
