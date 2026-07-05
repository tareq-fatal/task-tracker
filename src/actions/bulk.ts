"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isTaskStatus, isTaskPriority } from "@/lib/enums";

export type BulkResult = { ok: boolean; count: number; error?: string; undo?: UndoToken };

/**
 * A serializable description of how to reverse a bulk action, handed to the
 * client so the Undo toast can call {@link undoBulkAction}. All variants are
 * plain JSON (dates inside `restore` are ISO strings) so they cross the RSC
 * boundary cleanly.
 */
export type UndoToken =
  | { kind: "status" | "priority" | "assignee" | "sprint"; prev: [string, string | null][] }
  | { kind: "tag"; tagId: string; taskIds: string[] }
  | { kind: "restore"; snapshot: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function revalidateBulk() {
  revalidatePath("/");
  revalidatePath("/list");
  revalidatePath("/board");
  revalidatePath("/sprints");
}

/** Tasks (of the given ids) the current user is allowed to edit, tenant-scoped. */
async function editableIds(
  ids: string[],
  user: { id: string; role: string },
  tenantId: string
): Promise<string[]> {
  if (ids.length === 0) return [];
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, createdByUserId: true, assignedToUserId: true },
  });
  const admin = isAdminRole(user.role);
  return tasks
    .filter((t) => admin || t.createdByUserId === user.id || t.assignedToUserId === user.id)
    .map((t) => t.id);
}

/** Snapshot a scalar field for the given ids → used to build an undo token. */
async function snapshotField(
  ids: string[],
  field: "status" | "priority" | "assignedToUserId" | "sprintId"
): Promise<[string, string | null][]> {
  const rows = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, priority: true, assignedToUserId: true, sprintId: true },
  });
  return rows.map((r) => [r.id, r[field] ?? null]);
}

/* ------------------------------------------------------------------ */
/* Field mutations (status / priority / assignee / sprint)            */
/* ------------------------------------------------------------------ */

/** Used by "Move to column" (board) and "Set status" (list). */
export async function bulkSetStatusAction(ids: string[], status: string): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  if (!isTaskStatus(status)) return { ok: false, count: 0, error: "BAD_STATUS" };
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  const prev = await snapshotField(allowed, "status");
  const becameDone = status === "Done";
  await prisma.task.updateMany({
    where: { id: { in: allowed }, tenantId: tenant.id },
    data: { status, ...(becameDone ? { completedAt: new Date() } : { completedAt: null }) },
  });
  revalidateBulk();
  return { ok: true, count: allowed.length, undo: { kind: "status", prev } };
}

export async function bulkSetPriorityAction(ids: string[], priority: string): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  if (!isTaskPriority(priority)) return { ok: false, count: 0, error: "BAD_PRIORITY" };
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  const prev = await snapshotField(allowed, "priority");
  await prisma.task.updateMany({
    where: { id: { in: allowed }, tenantId: tenant.id },
    data: { priority },
  });
  revalidateBulk();
  return { ok: true, count: allowed.length, undo: { kind: "priority", prev } };
}

/**
 * Set the primary assignee (Hauptkopf) on many tasks. Admins may assign anyone;
 * a non-admin may only assign to themselves or clear it. Co-assignees (#13) are
 * left untouched; we just add a TaskAssignee row for the new primary so they
 * show up in the assignee set.
 */
export async function bulkAssignAction(ids: string[], userId: string | null): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  const admin = isAdminRole(user.role);
  if (userId && !admin && userId !== user.id) {
    return { ok: false, count: 0, error: "FORBIDDEN" };
  }
  if (userId) {
    const target = await prisma.user.findFirst({
      where: { id: userId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!target) return { ok: false, count: 0, error: "BAD_USER" };
  }
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  const prev = await snapshotField(allowed, "assignedToUserId");
  await prisma.task.updateMany({
    where: { id: { in: allowed }, tenantId: tenant.id },
    data: { assignedToUserId: userId },
  });
  if (userId) {
    await prisma.taskAssignee.createMany({
      data: allowed.map((taskId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
  }
  revalidateBulk();
  return { ok: true, count: allowed.length, undo: { kind: "assignee", prev } };
}

/** Bulk-move tasks into (or out of) a sprint. Admin-only, like the sprint board.
 *  A sprint only accepts tasks whose project matches it; mismatches are skipped. */
export async function bulkSetSprintAction(ids: string[], sprintId: string | null): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { ok: false, count: 0, error: "FORBIDDEN" };

  let projectId: string | null = null;
  if (sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, tenantId: tenant.id },
      select: { projectId: true },
    });
    if (!sprint) return { ok: false, count: 0, error: "SPRINT_NOT_FOUND" };
    projectId = sprint.projectId;
  }

  // Only tasks that exist in the tenant; when moving INTO a sprint, restrict to
  // that sprint's project so we never violate the project↔sprint invariant.
  const targets = await prisma.task.findMany({
    where: {
      id: { in: ids },
      tenantId: tenant.id,
      ...(projectId ? { projectId } : {}),
    },
    select: { id: true },
  });
  const allowed = targets.map((t) => t.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  const prev = await snapshotField(allowed, "sprintId");
  await prisma.task.updateMany({
    where: { id: { in: allowed }, tenantId: tenant.id },
    data: { sprintId },
  });
  revalidateBulk();
  return { ok: true, count: allowed.length, undo: { kind: "sprint", prev } };
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

/** Add a tag (find-or-create by name, tenant-scoped) to many tasks. */
export async function bulkAddTagAction(ids: string[], rawName: string): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  const name = rawName.trim().slice(0, 32);
  if (!name) return { ok: false, count: 0, error: "EMPTY" };
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  // Find-or-create the tag (case-insensitive match on the existing set).
  const existing = await prisma.tag.findFirst({
    where: { tenantId: tenant.id, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  const tag =
    existing ??
    (await prisma.tag.create({
      data: { tenantId: tenant.id, name, color: colorForName(name) },
      select: { id: true },
    }));

  // Which of the allowed tasks don't already have this tag? (undo only removes
  // the ones we actually added.)
  const already = await prisma.taskTag.findMany({
    where: { tagId: tag.id, taskId: { in: allowed } },
    select: { taskId: true },
  });
  const alreadySet = new Set(already.map((r) => r.taskId));
  const toAdd = allowed.filter((id) => !alreadySet.has(id));
  if (toAdd.length > 0) {
    await prisma.taskTag.createMany({
      data: toAdd.map((taskId) => ({ taskId, tagId: tag.id })),
      skipDuplicates: true,
    });
  }
  revalidateBulk();
  return { ok: true, count: toAdd.length, undo: { kind: "tag", tagId: tag.id, taskIds: toAdd } };
}

/** Deterministic pleasant color from a tag name (stable across renders). */
function colorForName(name: string): string {
  const palette = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/* ------------------------------------------------------------------ */
/* Delete (with snapshot-restore undo)                                 */
/* ------------------------------------------------------------------ */

type TaskSnapshot = Record<string, unknown>;

/** Serialize a Task row for the undo snapshot (dates → ISO strings). */
function serializeTask(t: Record<string, unknown>): TaskSnapshot {
  const out: TaskSnapshot = {};
  for (const [k, v] of Object.entries(t)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export async function bulkDeleteAction(ids: string[]): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  // Snapshot scalar rows + assignee/tag links so a 10s undo can recreate them.
  // (Comments, attachments, subtasks and links are NOT restored — a deliberate
  //  scope limit for the quick-undo; the delete is confirmed up front.)
  const tasks = await prisma.task.findMany({ where: { id: { in: allowed }, tenantId: tenant.id } });
  const assignees = await prisma.taskAssignee.findMany({
    where: { taskId: { in: allowed } },
    select: { taskId: true, userId: true, createdAt: true },
  });
  const tags = await prisma.taskTag.findMany({
    where: { taskId: { in: allowed } },
    select: { taskId: true, tagId: true },
  });

  const snapshot = JSON.stringify({
    tasks: tasks.map(serializeTask),
    assignees: assignees.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    tags,
  });

  const res = await prisma.task.deleteMany({ where: { id: { in: allowed }, tenantId: tenant.id } });
  revalidateBulk();
  return { ok: true, count: res.count, undo: { kind: "restore", snapshot } };
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

const FIELD_BY_KIND: Record<"status" | "priority" | "assignee" | "sprint", string> = {
  status: "status",
  priority: "priority",
  assignee: "assignedToUserId",
  sprint: "sprintId",
};

export async function undoBulkAction(token: UndoToken): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();

  if (token.kind === "restore") {
    return restoreDeleted(token.snapshot, user, tenant.id);
  }

  if (token.kind === "tag") {
    // Only remove links we actually created (and only from editable tasks).
    const allowed = new Set(await editableIds(token.taskIds, user, tenant.id));
    const taskIds = token.taskIds.filter((id) => allowed.has(id));
    if (taskIds.length === 0) return { ok: false, count: 0, error: "NONE" };
    await prisma.taskTag.deleteMany({ where: { tagId: token.tagId, taskId: { in: taskIds } } });
    revalidateBulk();
    return { ok: true, count: taskIds.length };
  }

  // field restore (status / priority / assignee / sprint)
  const ids = token.prev.map(([id]) => id);
  // sprint changes were admin-only; re-check that gate on undo too.
  const allowed =
    token.kind === "sprint" && !isAdminRole(user.role)
      ? new Set<string>()
      : new Set(await editableIds(ids, user, tenant.id));
  const field = FIELD_BY_KIND[token.kind];
  const entries = token.prev.filter(([id]) => allowed.has(id));
  if (entries.length === 0) return { ok: false, count: 0, error: "NONE" };

  // Group ids by target value so each distinct value is one updateMany.
  const byValue = new Map<string | null, string[]>();
  for (const [id, value] of entries) {
    const arr = byValue.get(value) ?? [];
    arr.push(id);
    byValue.set(value, arr);
  }
  let count = 0;
  for (const [value, groupIds] of byValue) {
    const data: Record<string, unknown> = { [field]: value };
    if (token.kind === "status") {
      data.completedAt = value === "Done" ? new Date() : null;
    }
    const r = await prisma.task.updateMany({
      where: { id: { in: groupIds }, tenantId: tenant.id },
      data,
    });
    count += r.count;
  }
  revalidateBulk();
  return { ok: true, count };
}

/** Recreate tasks (+ assignee/tag links) captured by a delete snapshot. */
async function restoreDeleted(
  snapshotJson: string,
  user: { id: string; role: string },
  tenantId: string
): Promise<BulkResult> {
  let parsed: {
    tasks: TaskSnapshot[];
    assignees: { taskId: string; userId: string; createdAt: string }[];
    tags: { taskId: string; tagId: string }[];
  };
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    return { ok: false, count: 0, error: "BAD_SNAPSHOT" };
  }

  // Never resurrect another tenant's data, and require the same edit rights the
  // deleter had (admin, or creator/assignee of the snapshotted task).
  const admin = isAdminRole(user.role);
  const dateFields = new Set([
    "dueDate",
    "createdAt",
    "updatedAt",
    "recurringNextAt",
    "timerStartedAt",
    "completedAt",
    "escalatedAt",
  ]);
  const restorable = parsed.tasks.filter(
    (t) =>
      t.tenantId === tenantId &&
      (admin || t.createdByUserId === user.id || t.assignedToUserId === user.id)
  );
  if (restorable.length === 0) return { ok: false, count: 0, error: "NONE" };
  const restoredIds = new Set(restorable.map((t) => t.id as string));

  // 1) Recreate the task rows with self-referential parentId nulled (a parent in
  //    the same batch may be inserted after its child — restore links in step 3).
  const parents = new Map<string, string | null>();
  const rows = restorable.map((t) => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      data[k] = dateFields.has(k) && typeof v === "string" ? new Date(v) : v;
    }
    parents.set(t.id as string, (t.parentId as string | null) ?? null);
    data.parentId = null;
    return data;
  });
  await prisma.task.createMany({ data: rows as never, skipDuplicates: true });

  // 2) assignee + tag links (skip any that reference a non-restored task).
  const assigneeRows = parsed.assignees
    .filter((a) => restoredIds.has(a.taskId))
    .map((a) => ({ taskId: a.taskId, userId: a.userId, createdAt: new Date(a.createdAt) }));
  if (assigneeRows.length) {
    await prisma.taskAssignee.createMany({ data: assigneeRows, skipDuplicates: true });
  }
  const tagRows = parsed.tags.filter((tg) => restoredIds.has(tg.taskId));
  if (tagRows.length) {
    await prisma.taskTag.createMany({ data: tagRows, skipDuplicates: true });
  }

  // 3) re-link parents that were also restored.
  for (const [id, parentId] of parents) {
    if (parentId && restoredIds.has(parentId)) {
      await prisma.task.update({ where: { id }, data: { parentId } }).catch(() => {});
    }
  }

  revalidateBulk();
  return { ok: true, count: restorable.length };
}
