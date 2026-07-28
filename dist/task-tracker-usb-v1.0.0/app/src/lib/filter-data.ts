import { prisma } from "./prisma";

/** Option lists for the FilterBar (projects, teams, users) — tenant-scoped. */
export async function loadFilterOptions(tenantId: string) {
  const [projects, teams, users] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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
