import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, invalidateProjectVisibility, projectConcealment } from "../prisma";
import { withAllProjects } from "./scope";
import {
  AFFILIATIONS,
  isAffiliation,
  isEmptyConcealment,
  projectIdFromUrl,
  visibleProjectWhere,
  visibleTaskWhere,
  type Affiliation,
} from "./policy";

/**
 * Server-Seite der Projekt-Sichtbarkeit: Zustand setzen (Verborgen,
 * Zugehörigkeit, Anzeige-Ebene) und Fragen beantworten, die über eine
 * einzelne Abfrage hinausgehen. Alle Setter sind mandanten-gebunden; die
 * Rollenprüfung liegt bei den Aufrufern (Actions, MCP-Ops).
 */

/** TOF-0966: Projekt verbergen/zeigen. false = existiert im Mandanten nicht. */
export async function setProjectHidden(
  tenantId: string,
  projectId: string,
  hidden: boolean,
  actorUserId: string
): Promise<boolean> {
  const updated = await withAllProjects(() =>
    prisma.project.updateMany({
      where: { id: projectId, tenantId, deletedAt: null },
      data: hidden ? { hiddenAt: new Date(), hiddenBy: actorUserId } : { hiddenAt: null, hiddenBy: null },
    })
  );
  invalidateProjectVisibility();
  return updated.count === 1;
}

/** TOF-0967: Zugehörigkeit eines Projekts setzen. */
export async function setProjectAffiliation(
  tenantId: string,
  projectId: string,
  affiliation: Affiliation
): Promise<boolean> {
  if (!isAffiliation(affiliation)) return false;
  const updated = await withAllProjects(() =>
    prisma.project.updateMany({ where: { id: projectId, tenantId, deletedAt: null }, data: { affiliation } })
  );
  invalidateProjectVisibility();
  return updated.count === 1;
}

/** Normalisiert eine Auswahl: gültig, ohne Doppelte, feste Reihenfolge; alle drei = Alle (leer). */
export function normalizeDisplayLevel(input: readonly unknown[]): Affiliation[] {
  const chosen = AFFILIATIONS.filter((a) => input.includes(a));
  return chosen.length === AFFILIATIONS.length ? [] : chosen;
}

/** TOF-0967: Anzeige-Ebene des Mandanten. Leer = Alle. */
export async function setTenantDisplayLevel(tenantId: string, affiliations: readonly unknown[]): Promise<Affiliation[]> {
  const value = normalizeDisplayLevel(affiliations);
  await prisma.tenant.update({ where: { id: tenantId }, data: { displayAffiliations: value } });
  invalidateProjectVisibility();
  return value;
}

export async function getTenantDisplayLevel(tenantId: string): Promise<Affiliation[]> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { displayAffiliations: true } });
  return (t?.displayAffiliations ?? []).filter(isAffiliation);
}

/**
 * Darf ein Ereignis (Aufgabe/Projekt-URL) nach außen gemeldet werden?
 * Unabhängig vom Anzeigemodus des Auslösers — ein Push aufs Handy darf ein
 * verborgenes Projekt oder eines außerhalb der Anzeige-Ebene nie verraten.
 */
export async function isConcealedTarget(target: { taskId?: string | null; url?: string | null }): Promise<boolean> {
  const c = await projectConcealment({ revealHidden: false, ignoreLevel: false });
  if (isEmptyConcealment(c)) return false;
  return withAllProjects(async () => {
    if (target.taskId) {
      const n = await prisma.task.count({ where: { id: target.taskId, NOT: visibleTaskWhere(c) } });
      if (n > 0) return true;
    }
    const projectId = projectIdFromUrl(target.url);
    if (projectId) {
      const n = await prisma.project.count({ where: { id: projectId, NOT: visibleProjectWhere(c) } });
      if (n > 0) return true;
    }
    return false;
  });
}

/**
 * Filter für VERSCHACHTELTE Aufgaben-Relationen (include/select), die an den
 * Prisma-Hooks vorbeilaufen — Unteraufgaben, Verknüpfungen in andere
 * Projekte. Leer, wenn gerade nichts zu verbergen ist.
 */
export async function nestedVisibleTask(): Promise<Prisma.TaskWhereInput> {
  const c = await projectConcealment();
  return (isEmptyConcealment(c) ? {} : visibleTaskWhere(c)) as Prisma.TaskWhereInput;
}

/** Für verschachtelte `_count`: Soft-Delete + aktuelle Sichtbarkeit. */
export async function countedTaskWhere(): Promise<Prisma.TaskWhereInput> {
  return { deletedAt: null, ...(await nestedVisibleTask()) };
}

export async function countedProjectWhere(): Promise<Prisma.ProjectWhereInput> {
  const c = await projectConcealment();
  return { deletedAt: null, ...(isEmptyConcealment(c) ? {} : visibleProjectWhere(c)) } as Prisma.ProjectWhereInput;
}
