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
 * unit-testable. Admins: tenant-only. Non-admins: their assigned tasks PLUS
 * every task in a project they're a member of. With no member projects the
 * clause collapses to `{ tenantId, assignedToUserId }` — identical to the old
 * assigned-only behaviour, so existing data is unaffected. Tenant scoping is
 * ALWAYS applied — never leak across tenants.
 */
export function taskVisibilityClause(
  user: { id: string; role: string },
  tenantId: string,
  projectIds: string[]
) {
  if (isAdminRole(user.role)) return { tenantId };
  if (projectIds.length === 0) {
    return { tenantId, assignedToUserId: user.id };
  }
  return {
    tenantId,
    OR: [
      { assignedToUserId: user.id },
      { projectId: { in: projectIds } },
    ],
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
    where: { projectId, tenantId, assignedToUserId: user.id },
    select: { id: true },
  });
  return Boolean(assigned);
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
      where: { tenantId, assignedToUserId: user.id, projectId: { not: null } },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);
  const ids = new Set(members);
  for (const t of assigned) if (t.projectId) ids.add(t.projectId);
  return [...ids];
}
