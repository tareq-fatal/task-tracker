import { prisma } from "./prisma";
import { visibleProjectIds } from "./task-access";

/** Project options scoped to what the user may see: admins get the whole
 *  tenant, everyone else only their involved projects — even NAMES of foreign
 *  projects must not leak through dropdowns. */
export async function scopedProjectOptions(
  user: { id: string; role: string },
  tenantId: string
): Promise<{ id: string; name: string }[]> {
  const allowed = await visibleProjectIds(user, tenantId);
  return prisma.project.findMany({
    where: {
      tenantId,
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Option lists for the FilterBar (projects, teams, users) — tenant-scoped;
 *  the PROJECT list is additionally scoped to the user's visibility. */
export async function loadFilterOptions(
  user: { id: string; role: string },
  tenantId: string
) {
  const [projects, teams, users] = await Promise.all([
    scopedProjectOptions(user, tenantId),
    prisma.team.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { projects, teams, users };
}
