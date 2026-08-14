import "server-only";
import { prisma } from "./prisma";
import { notifyMany } from "./notifications";
import { canSeeTask } from "./task-access";

/**
 * „Zur Prüfung" ist eine Bitte an eine Person, keine Statistik.
 *
 * Arbeitsregel von Tarek (14.08.2026): niemand schließt eigene Arbeit ab — was
 * fertig ist, geht in die Spalte `to-verify` und Tarek nimmt ab. Solange dieser
 * Übergang stumm bleibt, hängt die ganze Regel daran, dass er zufällig aufs
 * Board schaut. Diese Datei ist der eine Ort, der ihn benachrichtigt — geteilt
 * von Board (Ziehen und Ablegen) und Schnittstelle, damit beide Wege nicht
 * auseinanderlaufen.
 *
 * Empfänger: die zuständige Person und die Erstellerin bzw. der Ersteller —
 * beide nur, wenn sie die Aufgabe überhaupt sehen dürfen, und nie die Person,
 * die den Zug selbst gemacht hat.
 */
export async function notifyReviewRequested(input: {
  tenantId: string;
  taskId: string;
  taskTitle: string;
  assignedToUserId: string | null;
  createdByUserId: string;
  actor: { id: string; name: string };
}): Promise<string[]> {
  const candidateIds = [...new Set([input.assignedToUserId, input.createdByUserId])].filter(
    (x): x is string => Boolean(x) && x !== input.actor.id
  );
  if (candidateIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds }, tenantId: input.tenantId, deactivatedAt: null },
    select: { id: true, role: true },
  });

  const task = {
    createdByUserId: input.createdByUserId,
    assignedToUserId: input.assignedToUserId,
    assigneeIds: input.assignedToUserId ? [input.assignedToUserId] : [],
  };
  const ids = users.filter((u) => canSeeTask(u, task)).map((u) => u.id);
  if (ids.length === 0) return [];

  await notifyMany(ids, {
    tenantId: input.tenantId,
    type: "review",
    titleKey: "notif.t.review",
    body: `«${input.taskTitle}»\n👤 ${input.actor.name}`,
    url: `/tasks/${input.taskId}`,
    taskId: input.taskId,
    actorUserId: input.actor.id,
  });
  return ids;
}
