import { PrismaClient } from "@prisma/client";
import { createHiddenGuard, type HiddenGuard } from "./hidden-projects/guard";
import { revealHiddenProjects } from "./hidden-projects/scope";

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

  // TOF-0966 — verborgene Projekte: EIN Filter für alle Lese-Zugriffe auf
  // Projekt, Aufgabe und jede Tabelle, die daran hängt (Regeln in
  // lib/hidden-projects/policy.ts). Anders als der Soft-Delete-Filter oben
  // gilt er auch für findUnique — ein verborgenes Projekt soll auch per
  // direktem Link „nicht existieren“. Interne Abfragen laufen über `base`,
  // damit der Guard sich nicht selbst filtert.
  hiddenGuard = createHiddenGuard({
    loadHiddenProjectIds: async () =>
      (await base.project.findMany({ where: { hiddenAt: { not: null } }, select: { id: true } })).map((p) => p.id),
    loadTaskIds: async (projectIds) =>
      (await base.task.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((t) => t.id),
    reveal: revealHiddenProjects,
  });
  const guard = hiddenGuard;
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

let hiddenGuard: HiddenGuard | undefined;

/** Nach Verbergen/Einblenden aufrufen, damit der Filter sofort greift. */
export function invalidateHiddenProjects(): void {
  hiddenGuard?.invalidate();
  globalForPrisma.hiddenGuard?.invalidate();
}

type ExtendedClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedClient | undefined;
  hiddenGuard: HiddenGuard | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.hiddenGuard ??= hiddenGuard;
}
