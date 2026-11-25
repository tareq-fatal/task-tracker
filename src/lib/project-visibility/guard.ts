import {
  FILTERED_OPERATIONS,
  isEmptyConcealment,
  mergeWhere,
  modelWhere,
  notificationWhere,
  type Affiliation,
  type Concealment,
} from "./policy";
import type { VisibilityScope } from "./scope";

/**
 * Wendet die Sichtbarkeits-Policy auf eine einzelne Prisma-Abfrage an.
 * Bewusst von Prisma entkoppelt (Ports), damit Filterlogik, Cache und
 * Fail-closed-Verhalten ohne Datenbank testbar sind.
 */

export type VisibilityIndex = {
  hiddenProjectIds: string[];
  restrictions: { tenantId: string; allowed: Affiliation[] }[];
};

export type VisibilityGuardPorts = {
  /** Unfiltered: verborgene Projekte + Mandanten mit Anzeige-Ebene. */
  loadIndex: () => Promise<VisibilityIndex>;
  /** Unfiltered: IDs der unsichtbaren Projekte und Aufgaben (für Benachrichtigungen). */
  loadConcealedIds: (c: Concealment) => Promise<{ projectIds: string[]; taskIds: string[] }>;
  scope: () => Promise<VisibilityScope>;
  now?: () => number;
};

/** Kurzer Cache: ohne aktive Achse kostet der Guard keine Joins. */
const CACHE_MS = 5_000;

export function effectiveConcealment(index: VisibilityIndex, scope: VisibilityScope): Concealment {
  return {
    hidden: !scope.revealHidden && index.hiddenProjectIds.length > 0,
    restrictions: scope.ignoreLevel ? [] : index.restrictions,
  };
}

export function createVisibilityGuard(ports: VisibilityGuardPorts) {
  const now = ports.now ?? Date.now;
  let cached: { at: number; index: VisibilityIndex; ids: Map<string, Promise<{ projectIds: string[]; taskIds: string[] }>> } | null = null;

  async function current() {
    if (!cached || now() - cached.at > CACHE_MS) {
      cached = { at: now(), index: await ports.loadIndex(), ids: new Map() };
    }
    return cached;
  }

  return {
    /** Nach Verbergen/Zugehörigkeit/Anzeige-Ebene ändern: sofort neu laden. */
    invalidate() {
      cached = null;
    },

    /** Effektive Verbergung — für den laufenden Scope oder einen vorgegebenen. */
    async concealment(scope?: VisibilityScope): Promise<Concealment> {
      return effectiveConcealment((await current()).index, scope ?? (await ports.scope()));
    },

    async apply(
      model: string | undefined,
      operation: string,
      args: Record<string, unknown> | undefined
    ): Promise<Record<string, unknown> | undefined> {
      if (!model || !FILTERED_OPERATIONS.has(operation)) return args;
      const isNotification = model === "Notification";
      if (!isNotification && modelWhere(model, { hidden: false, restrictions: [] }) === null) return args;

      const entry = await current();
      if (entry.index.hiddenProjectIds.length === 0 && entry.index.restrictions.length === 0) return args;
      const c = effectiveConcealment(entry.index, await ports.scope());
      if (isEmptyConcealment(c)) return args;

      let extra: Record<string, unknown> | null;
      if (isNotification) {
        const key = JSON.stringify(c);
        let ids = entry.ids.get(key);
        if (!ids) entry.ids.set(key, (ids = ports.loadConcealedIds(c)));
        const { projectIds, taskIds } = await ids;
        extra = notificationWhere(projectIds, taskIds);
      } else {
        extra = modelWhere(model, c);
      }
      if (!extra) return args;
      const where = (args?.where ?? undefined) as Record<string, unknown> | undefined;
      return { ...(args ?? {}), where: mergeWhere(where, extra) };
    },
  };
}

export type VisibilityGuard = ReturnType<typeof createVisibilityGuard>;
