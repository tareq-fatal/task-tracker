import { prisma } from "./prisma";

export type BulkOptions = {
  users: { id: string; name: string }[];
  sprints: { id: string; name: string; project: string }[];
  tagSuggestions: string[];
};

/**
 * Option lists for the bulk action bar. Users + tag suggestions are available to
 * everyone; the sprint list (open sprints only) is admin-only, matching the
 * sprint board's own gate.
 */
export async function loadBulkOptions(
  tenantId: string,
  isAdmin: boolean,
  projectId?: string
): Promise<BulkOptions> {
  const [users, sprintRows, tags] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    isAdmin
      ? prisma.sprint.findMany({
          where: { tenantId, status: { not: "closed" }, ...(projectId ? { projectId } : {}) },
          select: { id: true, name: true, project: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string; project: { name: string } }[]),
    prisma.tag.findMany({
      where: { tenantId },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    users,
    sprints: sprintRows.map((s) => ({ id: s.id, name: s.name, project: s.project.name })),
    tagSuggestions: tags.map((t) => t.name),
  };
}
