import { prisma } from "./prisma";

/** Option lists for the FilterBar (projects, teams, users). */
export async function loadFilterOptions() {
  const [projects, teams, users] = await Promise.all([
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { projects, teams, users };
}
