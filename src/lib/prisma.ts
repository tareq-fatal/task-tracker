import { PrismaClient } from "@prisma/client";
import { createVisibilityGuard, type VisibilityGuard } from "./project-visibility/guard";
import { currentVisibilityScope, type VisibilityScope } from "./project-visibility/scope";
import { isAffiliation, visibleProjectWhere, visibleTaskWhere, type Concealment } from "./project-visibility/policy";

const createClient = () => {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Task soft-delete guard: every LIST-style task read silently excludes
  // soft-deleted rows (Task.deletedAt != null), so boards, lists, reports,
  // crons and search never see them without each call site opting in.
  //
  // Deliberately NOT intercepted:
  //  - findUnique / findUniqueOrThrow — the task detail page must load a
  //    deleted task to render the friendly "task was deleted" view, and the
  //    restore action needs it too. By-id lookups stay unfiltered; guards
  //    like assertCanEdit reject deleted tasks explicitly.
  //  - nested relation reads (include/select on other models) — Prisma does
  //    not route those through these hooks; the few affected spots (parent
  //    breadcrumb, children roll-up) intentionally keep showing the link,
  //    which now lands on the deleted-task page instead of a 404.
  const softDeleted = base.$extends({
    query: {
      project: {
        findMany({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        findFirst({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        count({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
      },
      task: {
        findMany({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        findFirst({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        count({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        aggregate({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        groupBy({ args, query }) {
          args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
      },
    },
  });

  // TOF-0966/0967 — Projekt-Sichtbarkeit (Verborgen + Anzeige-Ebene): EIN Filter für alle Lese-Zugriffe auf
  // Projekt, Aufgabe und jede Tabelle, die daran hängt (Regeln in
  // lib/project-visibility/policy.ts). Anders als der Soft-Delete-Filter oben
  // gilt er auch für findUnique — ein verborgenes Projekt soll auch per
  // direktem Link „nicht existieren“. Interne Abfragen laufen über `base`,
  // damit der Guard sich nicht selbst filtert.
  visibilityGuard = createVisibilityGuard({
    loadIndex: async () => {
      const [hidden, tenants] = await Promise.all([
        base.project.findMany({ where: { hiddenAt: { not: null } }, select: { id: true } }),
        base.tenant.findMany({ where: { NOT: { displayAffiliations: { isEmpty: true } } }, select: { id: true, displayAffiliations: true } }),
      ]);
      return {
        hiddenProjectIds: hidden.map((p) => p.id),
        restrictions: tenants.map((t) => ({ tenantId: t.id, allowed: t.displayAffiliations.filter(isAffiliation) })),
      };
    },
    loadConcealedIds: async (c) => {
      const [projects, tasks] = await Promise.all([
        base.project.findMany({ where: { NOT: visibleProjectWhere(c) }, select: { id: true } }),
        base.task.findMany({ where: { NOT: visibleTaskWhere(c) }, select: { id: true } }),
      ]);
      return { projectIds: projects.map((p) => p.id), taskIds: tasks.map((t) => t.id) };
    },
    scope: currentVisibilityScope,
  });
  const guard = visibilityGuard;
  return softDeleted.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query((await guard.apply(model, operation, args as Record<string, unknown>)) as typeof args);
        },
      },
    },
  });
};

let visibilityGuard: VisibilityGuard | undefined;

// Next.js lädt dieses Modul in Produktion je Bundle-Schicht (Server-Actions,
// RSC, Route-Handler) als EIGENE Instanz — jede mit eigenem Guard-Cache. Eine
// Änderung aus einer Action muss ALLE erreichen, sonst zeigt das Rendering bis
// zum Cache-Ablauf den alten Stand (Fund aus der Live-Prüfung TOF-0967).
// Darum registriert sich jeder Guard prozessweit.
const registry = globalThis as unknown as { __ttVisibilityGuards?: Set<VisibilityGuard> };
function registerGuard(g: VisibilityGuard | undefined): void {
  if (!g) return;
  (registry.__ttVisibilityGuards ??= new Set()).add(g);
}

/** Nach Verbergen, Zugehörigkeit oder Anzeige-Ebene ändern: Filter in ALLEN Instanzen sofort neu laden. */
export function invalidateProjectVisibility(): void {
  for (const g of registry.__ttVisibilityGuards ?? []) g.invalidate();
  visibilityGuard?.invalidate();
}

/** Effektive Verbergung (Verborgen + Anzeige-Ebene) für den laufenden oder einen vorgegebenen Scope. */
export async function projectConcealment(scope?: VisibilityScope): Promise<Concealment> {
  const g = visibilityGuard ?? globalForPrisma.visibilityGuard;
  return g ? g.concealment(scope) : { hidden: false, restrictions: [] };
}

type ExtendedClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedClient | undefined;
  visibilityGuard: VisibilityGuard | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();
registerGuard(visibilityGuard);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.visibilityGuard ??= visibilityGuard;
}
