import { PrismaClient } from "@prisma/client";

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
  return base.$extends({
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
};

type ExtendedClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
