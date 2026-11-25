import { FILTERED_OPERATIONS, MODEL_FILTERS, mergeWhere, notificationFilter } from "./policy";

/**
 * TOF-0966 — Wendet die Policy auf eine einzelne Prisma-Abfrage an.
 *
 * Bewusst von Prisma entkoppelt (nur zwei Ports), damit Filterlogik, Cache
 * und Fail-closed-Verhalten ohne Datenbank testbar sind.
 */

export type HiddenIndex = {
  projectIds: string[];
  /** Nur für Benachrichtigungen nötig; lazy geladen. */
  taskIds: () => Promise<string[]>;
};

export type HiddenGuardPorts = {
  /** Unfiltered: IDs aller verborgenen Projekte (alle Mandanten). */
  loadHiddenProjectIds: () => Promise<string[]>;
  /** Unfiltered: IDs der Aufgaben in diesen Projekten. */
  loadTaskIds: (projectIds: string[]) => Promise<string[]>;
  /** Soll für die laufende Abfrage NICHT gefiltert werden? */
  reveal: () => Promise<boolean>;
  now?: () => number;
};

/** Kurzer Cache: ohne verborgene Projekte kostet der Guard keine Abfrage-Joins. */
const CACHE_MS = 5_000;

export function createHiddenGuard(ports: HiddenGuardPorts) {
  const now = ports.now ?? Date.now;
  let cached: { at: number; projectIds: string[]; taskIds?: Promise<string[]> } | null = null;

  async function index(): Promise<HiddenIndex> {
    if (!cached || now() - cached.at > CACHE_MS) {
      cached = { at: now(), projectIds: await ports.loadHiddenProjectIds() };
    }
    const entry = cached;
    return {
      projectIds: entry.projectIds,
      taskIds: () => (entry.taskIds ??= ports.loadTaskIds(entry.projectIds)),
    };
  }

  return {
    /** Nach dem Verbergen/Einblenden sofort neu laden. */
    invalidate() {
      cached = null;
    },

    /** Liefert die (ggf. ergänzten) Abfrage-Argumente. */
    async apply(
      model: string | undefined,
      operation: string,
      args: Record<string, unknown> | undefined
    ): Promise<Record<string, unknown> | undefined> {
      if (!model || !FILTERED_OPERATIONS.has(operation)) return args;
      const isNotification = model === "Notification";
      const filter = MODEL_FILTERS[model];
      if (!filter && !isNotification) return args;
      if (await ports.reveal()) return args;

      const hidden = await index();
      if (hidden.projectIds.length === 0) return args; // nichts verborgen → kein Overhead

      const extra = isNotification
        ? notificationFilter(hidden.projectIds, await hidden.taskIds())
        : filter;
      if (!extra) return args;
      const where = (args?.where ?? undefined) as Record<string, unknown> | undefined;
      return { ...(args ?? {}), where: mergeWhere(where, extra) };
    },
  };
}

export type HiddenGuard = ReturnType<typeof createHiddenGuard>;
