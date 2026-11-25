/**
 * TOF-0966 — Verborgene Projekte: die EINE Stelle, die festlegt, welche
 * Datensätze ein verborgenes Projekt mit verschwinden lässt.
 *
 * Pure (keine DB, kein Request) — die Prisma-Erweiterung in lib/prisma.ts
 * wendet diese Regeln bei jedem Lesezugriff an, solange der Admin-Anzeigemodus
 * nicht aktiv ist. Neue Modelle mit Projekt- oder Aufgaben-Bezug gehören HIER
 * eingetragen; der Test `policy.test.ts` hält die Liste gegen das Schema.
 */

/** Lese-Operationen, die gefiltert werden. Schreiben bleibt unberührt. */
export const FILTERED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

/** Ein Projekt ist sichtbar, solange es nicht verborgen ist. */
export const VISIBLE_PROJECT: { hiddenAt: null } = { hiddenAt: null };

/** Aufgabe ohne Projekt ODER in einem sichtbaren Projekt. */
export const VISIBLE_TASK: { OR: [{ projectId: null }, { project: { hiddenAt: null } }] } = {
  OR: [{ projectId: null }, { project: VISIBLE_PROJECT }],
};

/**
 * Für verschachtelte `_count`-Selects: die laufen an den Prisma-Hooks vorbei
 * und müssen den Filter selbst tragen (siehe count-consistency.test.ts).
 */
export const COUNTED_TASK = { deletedAt: null, OR: [{ projectId: null }, { project: { hiddenAt: null } }] };
export const COUNTED_PROJECT = { deletedAt: null, hiddenAt: null };

type Where = Record<string, unknown>;

/**
 * Filter je Prisma-Modell (PascalCase, wie `$allModels` es liefert).
 * `Notification` hat keine Relation zu Aufgabe/Projekt und wird gesondert
 * behandelt (siehe notificationFilter).
 */
export const MODEL_FILTERS: Readonly<Record<string, Where>> = {
  Project: VISIBLE_PROJECT,
  Task: VISIBLE_TASK,

  // Pflicht-Relation zum Projekt
  Sprint: { project: VISIBLE_PROJECT },
  PlannerSync: { project: VISIBLE_PROJECT },
  Lead: { project: VISIBLE_PROJECT },
  ProjectContext: { project: VISIBLE_PROJECT },
  WissenSeite: { project: VISIBLE_PROJECT },
  Entscheidung: { project: VISIBLE_PROJECT },
  ProjectMember: { project: VISIBLE_PROJECT },
  WorkflowColumn: { project: VISIBLE_PROJECT },

  // Optionale Relation zum Projekt (null = mandantenweit, bleibt sichtbar)
  AutomationRule: { OR: [{ projectId: null }, { project: VISIBLE_PROJECT }] },
  CustomFieldDef: { OR: [{ projectId: null }, { project: VISIBLE_PROJECT }] },

  // Hängen an einer Aufgabe
  TaskAssignee: { task: VISIBLE_TASK },
  TaskComment: { task: VISIBLE_TASK },
  TaskCommentRead: { task: VISIBLE_TASK },
  TaskReadReceipt: { task: VISIBLE_TASK },
  TaskAttachment: { task: VISIBLE_TASK },
  TaskTimeEntry: { task: VISIBLE_TASK },
  ActivityLog: { task: VISIBLE_TASK },
  Subtask: { task: VISIBLE_TASK },
  VoiceNote: { task: VISIBLE_TASK },
  CustomFieldValue: { task: VISIBLE_TASK },
};

/**
 * Fügt `filter` an ein bestehendes `where` an, ohne dessen Felder anzutasten.
 * Unique-Felder bleiben auf oberster Ebene (Prisma 5 erlaubt bei findUnique
 * zusätzliche Nicht-Unique-Bedingungen, solange das Unique-Feld bleibt).
 */
export function mergeWhere(where: Where | undefined, filter: Where): Where {
  const base = where ?? {};
  const existing = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...existing, filter] };
}

/**
 * Benachrichtigungen tragen nur `taskId`/`url` (keine Relation). Ohne
 * verborgene Projekte gibt es nichts zu filtern → null.
 */
export function notificationFilter(
  hiddenProjectIds: readonly string[],
  hiddenTaskIds: readonly string[]
): Where | null {
  if (hiddenProjectIds.length === 0) return null;
  const parts: Where[] = [];
  if (hiddenTaskIds.length > 0) {
    parts.push({ OR: [{ taskId: null }, { taskId: { notIn: [...hiddenTaskIds] } }] });
  }
  parts.push({
    OR: [
      { url: null },
      { NOT: { OR: hiddenProjectIds.map((id) => ({ url: { startsWith: `/projects/${id}` } })) } },
    ],
  });
  return { AND: parts };
}

/** Projekt-ID aus einer App-URL (`/projects/<id>…`), sonst null. */
export function projectIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^\/projects\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}
