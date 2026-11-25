/**
 * Projekt-Sichtbarkeit — die EINE Stelle, die festlegt, welche Datensätze
 * mit einem nicht sichtbaren Projekt verschwinden. Zwei unabhängige Achsen:
 *
 *  - Verborgen (TOF-0966): einzelnes Projekt, `Project.hiddenAt`.
 *  - Anzeige-Ebene (TOF-0967): Mandanten-Einstellung
 *    `Tenant.displayAffiliations` — nur Projekte dieser Zugehörigkeiten.
 *    Aufgaben OHNE Projekt gehören zu keiner Ebene und sind dann ebenfalls
 *    unsichtbar (fail-closed).
 *
 * Pure (keine DB, kein Request). Die Prisma-Erweiterung in lib/prisma.ts baut
 * daraus pro Abfrage den Filter. Neue Modelle mit Projekt- oder Aufgaben-
 * Bezug gehören in MODEL_RELATIONS; policy.test.ts hält das gegen das Schema.
 */

export const AFFILIATIONS = ["tarek", "objektus", "marine"] as const;
export type Affiliation = (typeof AFFILIATIONS)[number];

export function isAffiliation(v: unknown): v is Affiliation {
  return typeof v === "string" && (AFFILIATIONS as readonly string[]).includes(v);
}

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

type Where = Record<string, unknown>;

/** Was gerade zu verbergen ist (bereits um Scope-Ausnahmen bereinigt). */
export type Concealment = {
  /** Gibt es verborgene Projekte (Achse 1 aktiv)? */
  hidden: boolean;
  /** Mandanten mit aktiver Anzeige-Ebene (Achse 2). */
  restrictions: readonly { tenantId: string; allowed: readonly Affiliation[] }[];
};

export function isEmptyConcealment(c: Concealment): boolean {
  return !c.hidden && c.restrictions.length === 0;
}

/** Bedingung „Projekt ist sichtbar“. */
export function visibleProjectWhere(c: Concealment): Where {
  const parts: Where[] = [];
  if (c.hidden) parts.push({ hiddenAt: null });
  if (c.restrictions.length > 0) {
    parts.push({
      NOT: {
        OR: c.restrictions.map((r) => ({ tenantId: r.tenantId, affiliation: { notIn: [...r.allowed] } })),
      },
    });
  }
  return parts.length === 1 ? parts[0] : { AND: parts };
}

/** Bedingung „Aufgabe ist sichtbar“: projektlos (nicht in eingeschränktem Mandanten) oder sichtbares Projekt. */
export function visibleTaskWhere(c: Concealment): Where {
  const loose: Where =
    c.restrictions.length > 0
      ? { projectId: null, tenantId: { notIn: c.restrictions.map((r) => r.tenantId) } }
      : { projectId: null };
  return { OR: [loose, { project: visibleProjectWhere(c) }] };
}

/**
 * Wie jedes Modell an Projekt/Aufgabe hängt. `Notification` hat keine
 * Relation und wird über IDs gefiltert (notificationWhere).
 */
export const MODEL_RELATIONS: Readonly<Record<string, "self-project" | "self-task" | "project" | "project?" | "task">> = {
  Project: "self-project",
  Task: "self-task",
  Sprint: "project",
  PlannerSync: "project",
  Lead: "project",
  ProjectContext: "project",
  WissenSeite: "project",
  Entscheidung: "project",
  ProjectMember: "project",
  WorkflowColumn: "project",
  AutomationRule: "project?",
  CustomFieldDef: "project?",
  TaskAssignee: "task",
  TaskComment: "task",
  TaskCommentRead: "task",
  TaskReadReceipt: "task",
  TaskAttachment: "task",
  TaskTimeEntry: "task",
  ActivityLog: "task",
  Subtask: "task",
  VoiceNote: "task",
  CustomFieldValue: "task",
};

/** Filter für ein Modell, oder null wenn es nicht betroffen ist. */
export function modelWhere(model: string, c: Concealment): Where | null {
  switch (MODEL_RELATIONS[model]) {
    case "self-project":
      return visibleProjectWhere(c);
    case "self-task":
      return visibleTaskWhere(c);
    case "project":
      return { project: visibleProjectWhere(c) };
    case "project?":
      return { OR: [{ projectId: null }, { project: visibleProjectWhere(c) }] };
    case "task":
      return { task: visibleTaskWhere(c) };
    default:
      return null;
  }
}

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

/** Benachrichtigungen: über die IDs der unsichtbaren Aufgaben und Projekte. */
export function notificationWhere(
  concealedProjectIds: readonly string[],
  concealedTaskIds: readonly string[]
): Where | null {
  const parts: Where[] = [];
  if (concealedTaskIds.length > 0) {
    parts.push({ OR: [{ taskId: null }, { taskId: { notIn: [...concealedTaskIds] } }] });
  }
  if (concealedProjectIds.length > 0) {
    parts.push({
      OR: [
        { url: null },
        { NOT: { OR: concealedProjectIds.map((id) => ({ url: { startsWith: `/projects/${id}` } })) } },
      ],
    });
  }
  return parts.length === 0 ? null : { AND: parts };
}

/** Projekt-ID aus einer App-URL (`/projects/<id>…`), sonst null. */
export function projectIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^\/projects\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}
