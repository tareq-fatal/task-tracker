import "server-only";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";
import { isSuperAdmin } from "./enums";
import { createRateLimiter } from "./rate-limit";

// ---------------------------------------------------------------------------
// Hard-delete a whole tenant (Mandant) and every scrap of data belonging to it.
//
// Most tenant-scoped models carry a real FK to Tenant with `onDelete: Cascade`
// (User, Project, Team, Task, Sprint, TenantAuthProvider, PlannerSync) — and
// their children cascade transitively (comments, attachments, subtasks,
// sessions, activity, …). A handful of models keep only a *plain* `tenantId`
// string with NO foreign key, so the DB cascade never touches them. Those must
// be swept explicitly or they leak as orphan rows:
//   Notification · SavedView · TaskTemplate · AutomationRule · CustomFieldDef
// (CustomFieldValue then cascades from CustomFieldDef.)
//
// This is a genuine hard delete — recovery is the backup script's job, not a
// soft-delete flag. BackendAdmin only, guarded at the call sites below.
// ---------------------------------------------------------------------------

export type TenantDeletionPreview = {
  id: string;
  slug: string;
  name: string;
  users: number;
  projects: number;
  tasks: number;
  teams: number;
  sprints: number;
  comments: number;
  attachments: number;
  fileBytes: number;
  notifications: number;
};

export type DeleteError =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SELF_DELETE"
  | "CONFIRM_MISMATCH"
  | "RATE_LIMITED";

/** Gather a precise "this is what will be destroyed" snapshot for the confirm UI. */
export async function previewTenantDeletion(
  id: string
): Promise<TenantDeletionPreview | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return null;

  const where = { tenantId: id };
  const [
    users,
    projects,
    tasks,
    teams,
    sprints,
    comments,
    attachments,
    fileAgg,
    notifications,
  ] = await Promise.all([
    prisma.user.count({ where }),
    prisma.project.count({ where }),
    prisma.task.count({ where }),
    prisma.team.count({ where }),
    prisma.sprint.count({ where }),
    prisma.taskComment.count({ where: { task: { tenantId: id } } }),
    prisma.taskAttachment.count({ where: { task: { tenantId: id } } }),
    prisma.taskAttachment.aggregate({
      _sum: { sizeBytes: true },
      where: { task: { tenantId: id } },
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    users,
    projects,
    tasks,
    teams,
    sprints,
    comments,
    attachments,
    fileBytes: fileAgg._sum.sizeBytes ?? 0,
    notifications,
  };
}

// One delete per minute per operator is plenty for a human and turns a
// fat-finger double-click into a harmless no-op. See rate-limit.ts for scope.
const deleteLimiter = createRateLimiter(60_000);

export type DeleteResult =
  | { ok: true; preview: TenantDeletionPreview }
  | { ok: false; error: DeleteError };

/**
 * Hard-delete a tenant after full authorization + confirmation checks.
 *
 * @param id       tenant id to delete
 * @param confirm  the tenant NAME the operator re-typed (must match exactly)
 * @param actor    the acting session user (must be BackendAdmin)
 */
export async function deleteTenant(
  id: string,
  confirm: string,
  actor: SessionUser
): Promise<DeleteResult> {
  if (!isSuperAdmin(actor.role)) return { ok: false, error: "FORBIDDEN" };

  // A BackendAdmin must never delete the Mandant they themselves belong to —
  // that would nuke their own account mid-request and orphan the session.
  if (actor.tenantId === id) return { ok: false, error: "SELF_DELETE" };

  const preview = await previewTenantDeletion(id);
  if (!preview) return { ok: false, error: "NOT_FOUND" };

  // Second confirmation stage: the typed name must match exactly.
  if (confirm.trim() !== preview.name) return { ok: false, error: "CONFIRM_MISMATCH" };

  if (!deleteLimiter.check(actor.id)) return { ok: false, error: "RATE_LIMITED" };

  await prisma.$transaction([
    // orphan-tenantId tables (no FK cascade) — sweep explicitly
    prisma.notification.deleteMany({ where: { tenantId: id } }),
    prisma.savedView.deleteMany({ where: { tenantId: id } }),
    prisma.taskTemplate.deleteMany({ where: { tenantId: id } }),
    prisma.automationRule.deleteMany({ where: { tenantId: id } }),
    prisma.customFieldDef.deleteMany({ where: { tenantId: id } }),
    // the tenant row — DB ON DELETE CASCADE removes users, projects, teams,
    // tasks, sprints, auth providers, planner syncs and all their children.
    prisma.tenant.delete({ where: { id } }),
  ]);

  deleteLimiter.mark(actor.id);
  await writeDeletionAudit(actor, preview);
  return { ok: true, preview };
}

/** Audit-log entry: "Mandant <slug> (<name>) gelöscht von <actor> am <createdAt>". */
async function writeDeletionAudit(actor: SessionUser, p: TenantDeletionPreview) {
  const summary =
    `[DELETE TENANT] ${p.slug} (${p.name}) — ` +
    `-${p.users} users, -${p.projects} projects, -${p.tasks} tasks, ` +
    `-${p.attachments} files`;
  await prisma.dbAuditLog
    .create({
      data: {
        userId: actor.id,
        userName: actor.name,
        sql: summary,
        mode: "purge",
        rowCount: p.users + p.projects + p.tasks,
      },
    })
    .catch(() => {});
}
