import "server-only";
import { prisma } from "@/lib/prisma";
import { taskVisibilityClause, visibleProjectIds } from "@/lib/task-access";
import type { KontextAufgabe, KontextProjekt } from "@/lib/kontext";
import { instanceUrl } from "@/lib/instance-url";

/** Absolute Basis für Links in der Ausgabe (wie export-runner.ts). */
export function kontextBasis(): string {
  return instanceUrl(); // TOF-0795: APP_URL > NEXT_PUBLIC_APP_URL > Build-Adresse
}

/**
 * Projekte samt aktueller Kontext-Fassung und sichtbaren Aufgaben — mit denselben
 * Sichtregeln wie überall (visibleProjectIds, taskVisibilityClause). Ein Token sieht also
 * nie mehr als der Benutzer, dem es gehört.
 */
export async function ladeKontexte(
  user: { id: string; role: string },
  tenantId: string,
  nurProjekt?: string,
): Promise<{ p: KontextProjekt; aufgaben: KontextAufgabe[] }[]> {
  const erlaubt = await visibleProjectIds(user, tenantId);
  // Ein fremdes Projekt ergibt eine LEERE Liste — nie „dann eben alle erlaubten“.
  if (nurProjekt && erlaubt && !erlaubt.includes(nurProjekt)) return [];
  const idFilter = nurProjekt ? { id: nurProjekt } : erlaubt ? { id: { in: erlaubt } } : {};
  const projekte = await prisma.project.findMany({
    where: { tenantId, deletedAt: null, ...idFilter },
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  if (projekte.length === 0) return [];
  const ids = projekte.map((p) => p.id);

  const [wissen, fassungen, aufgaben] = await Promise.all([
    // TOF-0839: die angepinnten Wissen-Seiten sind jetzt die Quelle; ProjectContext nur noch Rückfall.
    prisma.wissenSeite.findMany({
      where: { tenantId, projectId: { in: ids }, deletedAt: null, angepinnt: true },
      orderBy: [{ art: "asc" }, { titel: "asc" }],
      select: { projectId: true, titel: true, inhalt: true, aktualisiertAm: true, aktualisiertVon: { select: { name: true } } },
    }),
    prisma.projectContext.findMany({
      where: { projectId: { in: ids } },
      orderBy: { createdAt: "desc" },
      distinct: ["projectId"],
      select: { projectId: true, content: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { AND: [taskVisibilityClause(user, tenantId), { deletedAt: null, projectId: { in: ids } }] },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true, updatedAt: true, projectId: true },
    }),
  ]);
  const fassung = new Map(fassungen.map((f) => [f.projectId, f]));
  return projekte.map((p) => {
    const f = ausWissen(wissen.filter((w) => w.projectId === p.id)) ?? fassung.get(p.id);
    return {
      p: {
        id: p.id,
        name: p.name,
        description: p.description,
        kontext: f?.content ?? null,
        kontextStand: f ? { am: f.createdAt, von: f.user.name } : null,
      },
      aufgaben: aufgaben.filter((a) => a.projectId === p.id),
    };
  });
}

/** Angepinnte Wissen-Seiten eines Projekts als EIN Kontext-Text (mehrere: je Seite eine Überschrift). */
function ausWissen(
  seiten: { titel: string; inhalt: string; aktualisiertAm: Date; aktualisiertVon: { name: string } | null }[],
): { content: string; createdAt: Date; user: { name: string } } | undefined {
  if (seiten.length === 0) return undefined;
  const juengste = seiten.reduce((a, b) => (b.aktualisiertAm > a.aktualisiertAm ? b : a));
  const content =
    seiten.length === 1 ? seiten[0].inhalt : seiten.map((s) => `## ${s.titel}\n\n${s.inhalt.trim()}`).join("\n\n");
  return { content, createdAt: juengste.aktualisiertAm, user: { name: juengste.aktualisiertVon?.name ?? "?" } };
}
