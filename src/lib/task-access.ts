import { isAdminRole, isStaffRole } from "./enums";
import { prisma } from "./prisma";

/**
 * Project ids the (non-admin) user is an explicit member of, scoped to the
 * tenant. Used for PROJECT access/listing only — since the 2026-07-27
 * hardening, membership does NOT widen task visibility.
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
 * unit-testable. Admins: tenant-only. Non-admins: ONLY tasks they are
 * personally involved in — creator, Hauptkopf, or co-assignee (#13).
 *
 * HARDENED (customer, 2026-07-27): project membership no longer grants task
 * visibility. Being in a project lets you open the project page, but you see
 * exclusively your own tasks there ("er kann nur seinen Kram sehen").
 * The projectIds parameter is retained for signature stability but ignored.
 * Tenant scoping is ALWAYS applied.
 */
export function taskVisibilityClause(
  user: { id: string; role: string },
  tenantId: string,
  _projectIds: string[] = []
) {
  // Staff = Admin/BackendAdmin/SubAdmin — SubAdmin READS everything (writes
  // stay gated on isAdminRole in the actions).
  if (isStaffRole(user.role)) return { tenantId };
  return {
    tenantId,
    OR: [
      { assignees: { some: { userId: user.id } } },
      { assignedToUserId: user.id },
      { createdByUserId: user.id },
    ],
  };
}

/**
 * Prisma `where` scoping tasks to the active tenant AND (for non-admins) to
 * the tasks they may see. No DB lookup needed since the hardening — project
 * membership does not widen task visibility anymore.
 */
export async function taskVisibility(
  user: { id: string; role: string },
  tenantId: string
) {
  return taskVisibilityClause(user, tenantId);
}

/**
 * Prisma `where` for task PICKERS (parent selector etc.): every task the user
 * is involved in — creator OR any assignee (Hauptkopf/co-assignee) OR a task
 * in one of their member projects. Slightly wider than `taskVisibility` (which
 * omits creator-only tasks) and exactly what a user may reference. Admins: the
 * whole tenant, as everywhere.
 */
export async function taskParticipation(
  user: { id: string; role: string },
  tenantId: string
) {
  // HARDENED: identical to taskVisibility now — member-project tasks are no
  // longer referencable either ("nur seine Sachen", pickers included).
  return taskVisibility(user, tenantId);
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
  if (isStaffRole(user.role)) return true;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { id: true },
  });
  if (member) return true;

  const own = await prisma.project.findFirst({
    where: { id: projectId, tenantId, createdByUserId: user.id },
    select: { id: true },
  });
  if (own) return true;

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
  if (isStaffRole(user.role)) return null;

  const [members, assigned, created] = await Promise.all([
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
    prisma.project.findMany({
      where: { tenantId, createdByUserId: user.id },
      select: { id: true },
    }),
  ]);
  const ids = new Set(members);
  for (const t of assigned) if (t.projectId) ids.add(t.projectId);
  for (const p of created) ids.add(p.id);
  return [...ids];
}
