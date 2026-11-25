import "server-only";
import { prisma, invalidateHiddenProjects } from "../prisma";
import { withHiddenProjects, revealHiddenProjects } from "./scope";
import { projectIdFromUrl, VISIBLE_TASK } from "./policy";

/**
 * TOF-0966 — Server-Seite der verborgenen Projekte: Zustand setzen und
 * „gehört dieses Ereignis zu einem verborgenen Projekt?“ beantworten.
 */

/**
 * Verbirgt bzw. zeigt ein Projekt. Mandanten-gebunden; liefert false, wenn
 * das Projekt im Mandanten nicht existiert (oder gelöscht ist).
 */
export async function setProjectHidden(
  tenantId: string,
  projectId: string,
  hidden: boolean,
  actorUserId: string
): Promise<boolean> {
  const updated = await withHiddenProjects(() =>
    prisma.project.updateMany({
      where: { id: projectId, tenantId, deletedAt: null },
      data: hidden ? { hiddenAt: new Date(), hiddenBy: actorUserId } : { hiddenAt: null, hiddenBy: null },
    })
  );
  invalidateHiddenProjects();
  return updated.count === 1;
}

/**
 * Liegt das Ziel einer Benachrichtigung (Aufgabe oder Projekt-URL) in einem
 * verborgenen Projekt? Unabhängig vom Anzeigemodus des Auslösers — ein Push
 * aufs Handy darf ein verborgenes Projekt nie verraten.
 */
export async function isHiddenTarget(target: { taskId?: string | null; url?: string | null }): Promise<boolean> {
  return withHiddenProjects(async () => {
    if (target.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: target.taskId },
        select: { project: { select: { hiddenAt: true } } },
      });
      if (task?.project?.hiddenAt) return true;
    }
    const projectId = projectIdFromUrl(target.url);
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { hiddenAt: true } });
      if (project?.hiddenAt) return true;
    }
    return false;
  });
}

/**
 * Filter für VERSCHACHTELTE Aufgaben-Relationen (include/select), die an den
 * Prisma-Hooks vorbeilaufen — z. B. Unteraufgaben oder Verknüpfungen in ein
 * anderes Projekt. Im Anzeigemodus leer.
 */
export async function nestedVisibleTask(): Promise<typeof VISIBLE_TASK | Record<string, never>> {
  return (await revealHiddenProjects()) ? {} : VISIBLE_TASK;
}
