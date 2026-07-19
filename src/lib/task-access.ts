import { isAdminRole } from "./enums";
import { prisma } from "./prisma";

/**
 * Project ids the (non-admin) user is an explicit member of, scoped to the tenant.
 * Members see ALL tasks in those projects. Admins never need this (they see all).
 */
export async function memberProjectIds(
  userId: string,
  tenantId: string
): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where: { userId, project: { tenantId } },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/**
 * Pure builder for the task-visibility `where` clause — no DB access, so it's
 * unit-testable. Admins: tenant-only. Non-admins: any task they're an assignee
 * of (primary Hauptkopf OR co-assignee, #13) PLUS every task in a project they
 * belong to (#26). With no member projects the clause collapses to
 * `{ tenantId, assignees: { some } }` — the previous assigned-only behaviour
 * (the primary is mirrored into TaskAssignee). Tenant scoping is ALWAYS applied.
 */
export function taskVisibilityClause(
  user: { id: string; role: string },
  tenantId: string,
  projectIds: string[]
) {
  if (isAdminRole(user.role)) return { tenantId };
  const mine = { assignees: { some: { userId: user.id } } };
  if (projectIds.length === 0) {
    return { tenantId, ...mine };
  }
  return {
    tenantId,
    OR: [mine, { projectId: { in: projectIds } }],
  };
}

/**
 * Prisma `where` scoping tasks to the active tenant AND (for non-admins) to the
 * tasks they may see (#26). Async because project membership is a DB lookup.
 */
export async function taskVisibility(
  user: { id: string; role: string },
  tenantId: string
) {
  if (isAdminRole(user.role)) return { tenantId };
  const projectIds = await memberProjectIds(user.id, tenantId);
  return taskVisibilityClause(user, tenantId, projectIds);
}

/**
 * Can this user open a specific project? Admins: any project in the tenant.
 * Non-admins: projects they are a member of, OR projects that contain a task
 * assigned to them (so they never lose access to work they already have).
 */
export async function canAccessProject(
  user: { id: string; role: string },
  tenantId: string,
  projectId: string
): Promise<boolean> {
  if (isAdminRole(user.role)) return true;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { id: true },
  });
  if (member) return true;

  const assigned = await prisma.task.findFirst({
    where: { projectId, tenantId, assignees: { some: { userId: user.id } } },
    select: { id: true },
  });
  return Boolean(assigned);
}

/**
 * #36 — two-tier edit rights on a task:
 *  - "act": status, comments, timer, attachments, progress, subtasks —
 *    allowed for the creator, any assignee (co-assignees included), or admin.
 *  - "editContent": title, description, assignee, due date, priority, story
 *    points, custom fields, links — ONLY the creator or an admin.
 *    A user working an admin-assigned task may act but not rewrite it.
 */
export function canEditTaskContent(
  user: { id: string; role: string },
  task: { createdByUserId: string }
): boolean {
  return isAdminRole(user.role) || task.createdByUserId === user.id;
}

/**
 * Project ids a user may see in lists (member projects + projects with a task
 * assigned to them). Admins get null (meaning "no filter — all projects").
 */
export async function visibleProjectIds(
  user: { id: string; role: string },
  tenantId: string
): Promise<string[] | null> {
  if (isAdminRole(user.role)) return null;

  const [members, assigned] = await Promise.all([
    memberProjectIds(user.id, tenantId),
    prisma.task.findMany({
      where: {
        tenantId,
        assignees: { some: { userId: user.id } },
        projectId: { not: null },
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);
  const ids = new Set(members);
  for (const t of assigned) if (t.projectId) ids.add(t.projectId);
  return [...ids];
}
