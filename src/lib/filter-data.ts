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
  const [projects, teams, users, tags] = await Promise.all([
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
    tenantTags(tenantId),
  ]);
  return { projects, teams, users, tags };
}

/**
 * Die im Mandanten tatsaechlich vergebenen Schlagworte, alphabetisch.
 *
 * Bewusst aus den Aufgaben erhoben und nicht aus einer Verwaltungstabelle: es
 * gibt keine Pflege von Schlagworten, also auch keine Liste, die veralten
 * koennte. Nur nicht geloeschte Aufgaben zaehlen -- ein Schlagwort, das es nur
 * im Papierkorb gibt, soll den Filter nicht fuellen.
 *
 * `distinct` auf ein Array-Feld gibt es in Prisma nicht, darum die Mengenbildung
 * hier. Bei dieser Groessenordnung (Tausende Aufgaben) ist das eine Abfrage auf
 * eine Spalte, kein Problem.
 */
export async function tenantTags(tenantId: string): Promise<string[]> {
  const rows = await prisma.task.findMany({
    where: { tenantId, deletedAt: null },
    select: { tags: true },
  });
  const set = new Set<string>();
  for (const r of rows) for (const t of r.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, "de"));
}
