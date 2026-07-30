"use server";

import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { taskVisibility, visibleProjectIds } from "@/lib/task-access";
import { isAdminRole } from "@/lib/enums";
import {
  SEARCH_MIN_CHARS,
  dedupeItems,
  normalizeQuery,
  snippet,
  tokenize,
  tokensWhere,
  type SearchItem,
} from "@/lib/search";

// Strict pass = substring matches straight from Postgres. When it comes back
// thin (typos), a recency pool is appended and the client-side fuzzy ranker
// (fuse.js) filters it — so "serch" still finds "Search".
const STRICT_TAKE = { tasks: 20, projects: 10, users: 10, comments: 10 };
const POOL_TAKE = { tasks: 100, projects: 50, users: 50 };
const POOL_THRESHOLD = 5; // strict hits below this → add the fuzzy pool

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  project: { name: string } | null;
};

type ProjectRow = { id: string; name: string; description: string | null };

type UserRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
};

function taskItem(t: TaskRow, tokens: string[]): SearchItem {
  return {
    type: "task",
    id: t.id,
    title: t.title,
    subtitle: t.project?.name ?? undefined,
    href: `/tasks/${t.id}`,
    status: t.status,
    taskType: t.type,
    haystack: t.description ? snippet(t.description, tokens) : undefined,
  };
}

function projectItem(p: ProjectRow, tokens: string[]): SearchItem {
  return {
    type: "project",
    id: p.id,
    title: p.name,
    subtitle: p.description ? snippet(p.description, tokens) : undefined,
    href: `/projects/${p.id}`,
  };
}

function userItem(u: UserRow): SearchItem {
  return {
    type: "user",
    id: u.id,
    title: u.name,
    subtitle: `@${u.username}`,
    href: `/admin/users/${u.id}`,
    haystack: u.email ?? undefined,
  };
}

/**
 * Global search across tasks, projects, users and comments — ALWAYS scoped to
 * the active tenant, and for non-admins additionally to the tasks/projects
 * they may see (same rules as every list view: `taskVisibility` /
 * `visibleProjectIds`). Users are searchable by admins only (the result links
 * into /admin/users, which non-admins cannot open).
 */
export async function globalSearchAction(
  rawQuery: string
): Promise<SearchItem[]> {
  const { user, tenant } = await requireTenant();
  const query = normalizeQuery(rawQuery);
  if (query.length < SEARCH_MIN_CHARS) return [];
  const tokens = tokenize(query);
  const admin = isAdminRole(user.role);

  const [taskWhere, projIds] = await Promise.all([
    taskVisibility(user, tenant.id),
    visibleProjectIds(user, tenant.id),
  ]);
  // null = admin ("no filter") — still tenant-scoped, of course.
  const projectWhere =
    projIds === null
      ? { tenantId: tenant.id }
      : { tenantId: tenant.id, id: { in: projIds } };

  const taskSelect = {
    id: true,
    title: true,
    description: true,
    status: true,
    type: true,
    project: { select: { name: true } },
  } as const;

  const [tasks, projects, users, comments] = await Promise.all([
    prisma.task.findMany({
      where: { ...taskWhere, ...tokensWhere(tokens, ["title", "description"]) },
      select: taskSelect,
      orderBy: { updatedAt: "desc" },
      take: STRICT_TAKE.tasks,
    }),
    prisma.project.findMany({
      where: { ...projectWhere, ...tokensWhere(tokens, ["name", "description"]) },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: "desc" },
      take: STRICT_TAKE.projects,
    }),
    admin
      ? prisma.user.findMany({
          where: {
            tenantId: tenant.id,
            ...tokensWhere(tokens, ["name", "username", "email"]),
          },
          select: { id: true, name: true, username: true, email: true },
          orderBy: { name: "asc" },
          take: STRICT_TAKE.users,
        })
      : Promise.resolve([]),
    prisma.taskComment.findMany({
      // comment visibility == visibility of its task (tenant + role scoped)
      where: { task: taskWhere, ...tokensWhere(tokens, ["content"]) },
      select: {
        id: true,
        content: true,
        taskId: true,
        task: { select: { title: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: STRICT_TAKE.comments,
    }),
  ]);

  const items: SearchItem[] = [
    ...tasks.map((t) => taskItem(t, tokens)),
    ...projects.map((p) => projectItem(p, tokens)),
    ...users.map(userItem),
    ...comments.map((c) => ({
      type: "comment" as const,
      id: c.id,
      title: c.task.title,
      subtitle: `${c.user.name}: ${snippet(c.content, tokens)}`,
      href: `/tasks/${c.taskId}`,
      haystack: snippet(c.content, tokens, 160),
    })),
  ];

  // Thin strict result → append a recency pool for client-side fuzzy matching.
  if (items.length < POOL_THRESHOLD) {
    const [poolTasks, poolProjects, poolUsers] = await Promise.all([
      prisma.task.findMany({
        // taskWhere comes from taskVisibility() — the explicit tenantId is
        // redundant (same value) but keeps the scope visible in-place.
        where: { ...taskWhere, tenantId: tenant.id },
        select: taskSelect,
        orderBy: { updatedAt: "desc" },
        take: POOL_TAKE.tasks,
      }),
      prisma.project.findMany({
        where: { ...projectWhere, tenantId: tenant.id },
        select: { id: true, name: true, description: true },
        orderBy: { createdAt: "desc" },
        take: POOL_TAKE.projects,
      }),
      admin
        ? prisma.user.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, name: true, username: true, email: true },
            orderBy: { name: "asc" },
            take: POOL_TAKE.users,
          })
        : Promise.resolve([]),
    ]);
    items.push(
      ...[
        ...poolTasks.map((t) => taskItem(t, tokens)),
        ...poolProjects.map((p) => projectItem(p, tokens)),
        ...poolUsers.map(userItem),
      ].map((item) => ({ ...item, pool: true }))
    );
  }

  return dedupeItems(items);
}
