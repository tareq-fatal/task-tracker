import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRole, isStaffRole, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/enums";
import { taskVisibility, visibleProjectIds } from "@/lib/task-access";
import { statusGateFor } from "@/lib/task-workflow-gate";
import { progressFromSubtasks } from "@/lib/tasks";
import { MAX_UPLOAD_BYTES, ALLOWED_MIME, MIME_EXTENSION } from "@/lib/validation";
import { UPLOAD_ROOT } from "@/lib/upload-paths";
import { notifyMany } from "@/lib/notifications";
import { notifyMentions } from "@/lib/mentions";
import { dispatchWebhookEvent } from "@/lib/webhooks-dispatch";
import { applyAutomations } from "@/lib/automation-run";
import { formatPromptComment } from "./prompt-format";
import type { ApiScope } from "@/lib/api-token";
import type { McpContext } from "./auth";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Operation-level failure carrying the HTTP status the route should return. */
export class McpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "McpError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Shared guards — the MCP inherits the UI's rules, it does not relax   */
/* them. Each helper mirrors its counterpart in src/actions/tasks.ts.   */
/* ------------------------------------------------------------------ */

/** Append an activity-log entry (best-effort; never blocks the mutation). */
async function logActivity(
  taskId: string,
  userId: string,
  type: string,
  detail?: string | null
): Promise<void> {
  await prisma.activityLog
    .create({ data: { taskId, userId, type, detail: detail ?? null } })
    .catch(() => {});
}

/**
 * "Act" gate — mirrors assertCanEdit() in actions/tasks.ts: admins, the
 * creator and any assignee may act on a task. A task from another tenant is
 * reported as NOT_FOUND, never FORBIDDEN, so the API cannot be used to probe
 * for the existence of foreign ids.
 */
async function assertCanAct(ctx: McpContext, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.tenantId !== ctx.tenant.id || task.deletedAt) {
    throw new McpError("task not found", 404);
  }
  if (isAdminRole(ctx.user.role) || task.createdByUserId === ctx.user.id) return task;
  const assignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId: ctx.user.id } },
    select: { id: true },
  });
  if (!assignee) throw new McpError("forbidden", 403);
  return task;
}

/** "Edit content" gate — mirrors assertCanEditContent(): creator or admin. */
async function assertCanEditContent(ctx: McpContext, taskId: string) {
  const task = await assertCanAct(ctx, taskId);
  if (!isAdminRole(ctx.user.role) && task.createdByUserId !== ctx.user.id) {
    throw new McpError("forbidden", 403);
  }
  return task;
}

/**
 * Resolve project/assignee ids against the ACTIVE TENANT — an id from another
 * mandant resolves to null rather than being written through (same rule as
 * scopedRelations() in actions/tasks.ts).
 */
async function scopedRelations(
  tenantId: string,
  d: { projectId?: string | null; assignedToUserId?: string | null }
): Promise<{ projectId: string | null; assignedToUserId: string | null }> {
  const [project, assignee] = await Promise.all([
    d.projectId
      ? prisma.project.findFirst({ where: { id: d.projectId, tenantId }, select: { id: true } })
      : null,
    d.assignedToUserId
      ? prisma.user.findFirst({ where: { id: d.assignedToUserId, tenantId }, select: { id: true } })
      : null,
  ]);
  return { projectId: project?.id ?? null, assignedToUserId: assignee?.id ?? null };
}

/** Recompute a task's progress from its checklist (no-op when it has none). */
async function recomputeTaskProgress(taskId: string): Promise<void> {
  const subs = await prisma.subtask.findMany({ where: { taskId } });
  if (subs.length === 0) return;
  const done = subs.filter((s) => s.done).length;
  await prisma.task.update({
    where: { id: taskId },
    data: { progress: progressFromSubtasks(done, subs.length) },
  });
}

/* ------------------------------------------------------------------ */
/* Serializers — a stable, small JSON shape for the agent              */
/* ------------------------------------------------------------------ */

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  progress: number;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project?: { id: string; name: string } | null;
  assignedTo?: { id: string; name: string; username: string } | null;
};

function serializeTask(t: TaskRow, extra: Record<string, unknown> = {}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    type: t.type,
    progress: t.progress,
    dueDate: t.dueDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
    assignedTo: t.assignedTo
      ? { id: t.assignedTo.id, name: t.assignedTo.name, username: t.assignedTo.username }
      : null,
    url: `/tasks/${t.id}`,
    ...extra,
  };
}

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  type: true,
  progress: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, username: true } },
} as const;

/* ------------------------------------------------------------------ */
/* Prompt journaling — the reason this endpoint exists                 */
/* ------------------------------------------------------------------ */

/**
 * A logged prompt is a WORKING NOTE, not a discussion message: it is written as
 * a comment (so it shows in the task thread and survives export) plus an
 * activity entry, but it deliberately sends NO notifications. A hook that fires
 * on every prompt would otherwise push a phone alert per keystroke-session.
 * Rendering lives in ./prompt-format so it can be unit-tested.
 */

/* ------------------------------------------------------------------ */
/* Operation registry                                                  */
/* ------------------------------------------------------------------ */

export type McpOp = {
  /** Minimum scope the token must carry. */
  scope: ApiScope;
  /** One-liner surfaced to the agent as the MCP tool description. */
  describe: string;
  schema: z.ZodTypeAny;
  run: (ctx: McpContext, params: never) => Promise<unknown>;
};

const idSchema = z.string().trim().min(1).max(64);

export const OPS: Record<string, McpOp> = {
  /* ---------------- read ---------------- */

  whoami: {
    scope: "read",
    describe: "Who am I acting as — user, role, tenant and the token's scopes.",
    schema: z.object({}).strict(),
    run: async (ctx) => ({
      user: { id: ctx.user.id, name: ctx.user.name, username: ctx.user.username, role: ctx.user.role },
      tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name },
      scopes: [...ctx.scopes],
      canWrite: ctx.scopes.has("write"),
    }),
  },

  list_projects: {
    scope: "read",
    describe: "List the projects visible to me.",
    schema: z.object({ limit: z.number().int().min(1).max(100).default(50) }).strict(),
    run: async (ctx, params: { limit: number }) => {
      const allowed = await visibleProjectIds(ctx.user, ctx.tenant.id);
      const projects = await prisma.project.findMany({
        where: { tenantId: ctx.tenant.id, ...(allowed ? { id: { in: allowed } } : {}) },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          // Nested _count bypasses the soft-delete client extension, so the
          // filter has to be spelled out here (see count-consistency.test.ts).
          _count: { select: { tasks: { where: { deletedAt: null } } } },
        },
        orderBy: { name: "asc" },
        take: params.limit,
      });
      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        color: p.color,
        taskCount: p._count.tasks,
      }));
    },
  },

  list_tasks: {
    scope: "read",
    describe:
      "List/search tasks I may see. Filter by status, priority, project, assignee (\"me\") or a text query.",
    schema: z
      .object({
        query: z.string().trim().max(200).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        projectId: idSchema.optional(),
        mine: z.boolean().default(false),
        openOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(25),
      })
      .strict(),
    run: async (
      ctx,
      params: {
        query?: string;
        status?: string;
        priority?: string;
        projectId?: string;
        mine: boolean;
        openOnly: boolean;
        limit: number;
      }
    ) => {
      // User-supplied narrowing only. It is ANDed onto the visibility clause
      // below and can therefore never widen what the caller may see.
      const filters: Record<string, unknown> = {};
      const and: Record<string, unknown>[] = [];
      if (params.status) filters.status = params.status;
      else if (params.openOnly) filters.status = { notIn: ["Done", "Archived"] };
      if (params.priority) filters.priority = params.priority;
      if (params.projectId) filters.projectId = params.projectId;
      if (params.mine) {
        and.push({
          OR: [{ assignedToUserId: ctx.user.id }, { assignees: { some: { userId: ctx.user.id } } }],
        });
      }
      if (params.query) {
        and.push({
          OR: [
            { title: { contains: params.query, mode: "insensitive" } },
            { description: { contains: params.query, mode: "insensitive" } },
          ],
        });
      }

      const tasks = await prisma.task.findMany({
        // taskVisibility spread FIRST and inline, so every read of this list is
        // visibly tenant- and permission-scoped at the query itself.
        where: {
          ...(await taskVisibility(ctx.user, ctx.tenant.id)),
          ...filters,
          ...(and.length ? { AND: and } : {}),
        },
        select: TASK_SELECT,
        orderBy: [{ updatedAt: "desc" }],
        take: params.limit,
      });
      return tasks.map((t) => serializeTask(t));
    },
  },

  get_task: {
    scope: "read",
    describe: "Full detail of one task: description, checklist steps, comments and attachments.",
    schema: z.object({ taskId: idSchema }).strict(),
    run: async (ctx, params: { taskId: string }) => {
      const visibility = await taskVisibility(ctx.user, ctx.tenant.id);
      const task = await prisma.task.findFirst({
        where: { id: params.taskId, ...visibility },
        select: {
          ...TASK_SELECT,
          subtasks: {
            select: { id: true, title: true, done: true, order: true },
            orderBy: { order: "asc" },
          },
          comments: {
            select: { id: true, content: true, createdAt: true, user: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
          attachments: {
            where: { deletedAt: null },
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
            orderBy: { uploadedAt: "desc" },
          },
        },
      });
      if (!task) throw new McpError("task not found", 404);

      return serializeTask(task, {
        steps: task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
        comments: task.comments.map((c) => ({
          id: c.id,
          author: c.user.name,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
        })),
        attachments: task.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          uploadedAt: a.uploadedAt.toISOString(),
        })),
      });
    },
  },

  list_steps: {
    scope: "read",
    describe: "The checklist steps (subtasks) of a task.",
    schema: z.object({ taskId: idSchema }).strict(),
    run: async (ctx, params: { taskId: string }) => {
      const visibility = await taskVisibility(ctx.user, ctx.tenant.id);
      const task = await prisma.task.findFirst({
        where: { id: params.taskId, ...visibility },
        select: { id: true },
      });
      if (!task) throw new McpError("task not found", 404);
      const steps = await prisma.subtask.findMany({
        where: { taskId: params.taskId },
        select: { id: true, title: true, done: true, order: true, completedAt: true },
        orderBy: { order: "asc" },
      });
      return steps.map((s) => ({
        id: s.id,
        title: s.title,
        done: s.done,
        completedAt: s.completedAt?.toISOString() ?? null,
      }));
    },
  },

  /* ---------------- write ---------------- */

  create_task: {
    scope: "write",
    describe: "Create a task. Optionally with checklist steps and a project.",
    schema: z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(5000).optional(),
        status: z.enum(TASK_STATUSES).default("Todo"),
        priority: z.enum(TASK_PRIORITIES).default("Medium"),
        type: z.enum(TASK_TYPES).default("Task"),
        projectId: idSchema.optional(),
        assignedToUserId: idSchema.optional(),
        dueDate: z.string().trim().datetime({ offset: true }).optional(),
        steps: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
      })
      .strict(),
    run: async (
      ctx,
      params: {
        title: string;
        description?: string;
        status: string;
        priority: string;
        type: string;
        projectId?: string;
        assignedToUserId?: string;
        dueDate?: string;
        steps: string[];
      }
    ) => {
      // Non-admins may only create tasks assigned to themselves — same rule the
      // create form enforces.
      const wanted = isAdminRole(ctx.user.role) ? params.assignedToUserId ?? null : ctx.user.id;
      const rel = await scopedRelations(ctx.tenant.id, {
        projectId: params.projectId ?? null,
        assignedToUserId: wanted,
      });

      const task = await prisma.task.create({
        data: {
          title: params.title,
          description: params.description || null,
          status: params.status,
          priority: params.priority,
          type: params.type,
          projectId: rel.projectId,
          assignedToUserId: rel.assignedToUserId,
          dueDate: params.dueDate ? new Date(params.dueDate) : null,
          progress: params.status === "Done" ? 100 : 0,
          completedAt: params.status === "Done" ? new Date() : null,
          createdByUserId: ctx.user.id,
          tenantId: ctx.tenant.id,
        },
        select: TASK_SELECT,
      });

      if (params.steps.length > 0) {
        await prisma.subtask.createMany({
          data: params.steps.map((title, i) => ({ taskId: task.id, title, order: i })),
        });
      }
      if (rel.assignedToUserId) {
        await prisma.taskAssignee.create({
          data: { taskId: task.id, userId: rel.assignedToUserId },
        });
      }

      await logActivity(task.id, ctx.user.id, "created", "via MCP");
      await applyAutomations(ctx.tenant.id, task.id, { type: "created", projectId: rel.projectId });
      await dispatchWebhookEvent({
        tenantId: ctx.tenant.id,
        tenantSlug: ctx.tenant.slug,
        event: "task.created",
        data: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          projectId: rel.projectId,
        },
      });
      if (rel.assignedToUserId && rel.assignedToUserId !== ctx.user.id) {
        await notifyMany([rel.assignedToUserId], {
          tenantId: ctx.tenant.id,
          type: "assigned",
          titleKey: "notif.t.assignedNew",
          body: task.title,
          url: `/tasks/${task.id}`,
          taskId: task.id,
          actorUserId: ctx.user.id,
        });
      }

      return serializeTask(task, { stepsCreated: params.steps.length });
    },
  },

  update_task: {
    scope: "write",
    describe:
      "Update a task. `descriptionAppend` adds a paragraph without overwriting what is already there.",
    schema: z
      .object({
        taskId: idSchema,
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(5000).optional(),
        descriptionAppend: z.string().trim().min(1).max(2000).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        projectId: idSchema.nullable().optional(),
        dueDate: z.string().trim().datetime({ offset: true }).nullable().optional(),
      })
      .strict()
      .refine(
        (v) =>
          v.title !== undefined ||
          v.description !== undefined ||
          v.descriptionAppend !== undefined ||
          v.status !== undefined ||
          v.priority !== undefined ||
          v.projectId !== undefined ||
          v.dueDate !== undefined,
        { message: "nothing to update" }
      ),
    run: async (
      ctx,
      params: {
        taskId: string;
        title?: string;
        description?: string;
        descriptionAppend?: string;
        status?: string;
        priority?: string;
        projectId?: string | null;
        dueDate?: string | null;
      }
    ) => {
      const contentChange =
        params.title !== undefined ||
        params.description !== undefined ||
        params.descriptionAppend !== undefined ||
        params.priority !== undefined ||
        params.projectId !== undefined ||
        params.dueDate !== undefined;

      // Status alone is an "act"; rewriting the task is "edit content" (#36).
      const task = contentChange
        ? await assertCanEditContent(ctx, params.taskId)
        : await assertCanAct(ctx, params.taskId);

      const data: Record<string, unknown> = {};
      if (params.title !== undefined) data.title = params.title;
      if (params.description !== undefined) data.description = params.description || null;
      if (params.descriptionAppend !== undefined) {
        data.description = task.description
          ? `${task.description}\n\n${params.descriptionAppend}`
          : params.descriptionAppend;
      }
      if (params.priority !== undefined) data.priority = params.priority;
      if (params.dueDate !== undefined) data.dueDate = params.dueDate ? new Date(params.dueDate) : null;
      if (params.projectId !== undefined) {
        const rel = await scopedRelations(ctx.tenant.id, { projectId: params.projectId });
        data.projectId = rel.projectId;
      }

      if (params.status !== undefined && params.status !== task.status) {
        // Admin workflow control: target column, mandatory todos, mandatory
        // time tracking. Non-admins hit exactly the same gate as in the UI.
        const gate = await statusGateFor(params.taskId, ctx.user.role, task.status, params.status);
        if (!gate.ok) {
          // TARGET_LOCKED | TODOS_OPEN | TIME_REQUIRED — passed through verbatim
          // so the agent can explain precisely why the move was refused.
          throw new McpError(`status change blocked: ${gate.error}`, 409);
        }
        data.status = params.status;
        data.completedAt = params.status === "Done" ? new Date() : null;
        if (params.status === "Done") data.progress = 100;
      }

      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data,
        select: TASK_SELECT,
      });

      await logActivity(params.taskId, ctx.user.id, "updated", "via MCP");
      // "task.completed" is the only status-related webhook the product defines
      // (WEBHOOK_EVENTS) — other transitions stay silent, as they do in the UI.
      if (data.status === "Done") {
        await dispatchWebhookEvent({
          tenantId: ctx.tenant.id,
          tenantSlug: ctx.tenant.slug,
          event: "task.completed",
          data: { id: updated.id, title: updated.title, status: updated.status },
        });
      }
      return serializeTask(updated);
    },
  },

  add_comment: {
    scope: "write",
    describe: "Add a comment to a task (notifies watchers, like a comment written in the UI).",
    schema: z.object({ taskId: idSchema, content: z.string().trim().min(1).max(4000) }).strict(),
    run: async (ctx, params: { taskId: string; content: string }) => {
      const task = await assertCanAct(ctx, params.taskId);
      const comment = await prisma.taskComment.create({
        data: {
          taskId: params.taskId,
          userId: ctx.user.id,
          content: params.content,
          language: ctx.user.locale,
        },
        select: { id: true, createdAt: true },
      });
      await logActivity(params.taskId, ctx.user.id, "comment", params.content.slice(0, 80));

      // @mentions from the agent notify exactly like a comment written in the
      // UI — same helper, same visibility gate, same channels.
      const mentionedIds = await notifyMentions({
        content: params.content,
        taskId: params.taskId,
        taskTitle: task.title,
        tenantId: ctx.tenant.id,
        actor: { id: ctx.user.id, name: ctx.user.name },
      });

      const coAssignees = await prisma.taskAssignee.findMany({
        where: { taskId: params.taskId },
        select: { userId: true },
      });
      const watchers = [
        task.assignedToUserId,
        task.createdByUserId,
        ...coAssignees.map((a) => a.userId),
      ].filter((x): x is string => Boolean(x) && !mentionedIds.has(x as string));
      await notifyMany(watchers, {
        tenantId: ctx.tenant.id,
        type: "comment",
        titleKey: "notif.t.comment",
        body: `«${task.title}»\n👤 ${ctx.user.name}: ${params.content.slice(0, 60)}`,
        url: `/tasks/${params.taskId}`,
        taskId: params.taskId,
        actorUserId: ctx.user.id,
      });

      return { id: comment.id, createdAt: comment.createdAt.toISOString() };
    },
  },

  log_prompt: {
    scope: "write",
    describe:
      "Record a Claude Code prompt on a task so the instruction is not lost. Silent: no notifications.",
    schema: z
      .object({
        taskId: idSchema,
        prompt: z.string().trim().min(1).max(20000),
        cwd: z.string().trim().max(300).optional(),
        branch: z.string().trim().max(200).optional(),
      })
      .strict(),
    run: async (ctx, params: { taskId: string; prompt: string; cwd?: string; branch?: string }) => {
      await assertCanAct(ctx, params.taskId);
      const content = formatPromptComment({
        prompt: params.prompt,
        cwd: params.cwd ?? null,
        branch: params.branch ?? null,
        at: new Date(),
      });
      const comment = await prisma.taskComment.create({
        data: {
          taskId: params.taskId,
          userId: ctx.user.id,
          content,
          language: ctx.user.locale,
        },
        select: { id: true, createdAt: true },
      });
      // Activity only — deliberately no notifyMany() here, see PROMPT_MARKER.
      await logActivity(params.taskId, ctx.user.id, "mcp_prompt", params.prompt.slice(0, 80));
      return {
        id: comment.id,
        createdAt: comment.createdAt.toISOString(),
        charsStored: content.length,
      };
    },
  },

  add_step: {
    scope: "write",
    describe: "Append a checklist step (subtask) to a task.",
    schema: z.object({ taskId: idSchema, title: z.string().trim().min(1).max(200) }).strict(),
    run: async (ctx, params: { taskId: string; title: string }) => {
      await assertCanAct(ctx, params.taskId); // checklist = shared working state
      const max = await prisma.subtask.aggregate({
        where: { taskId: params.taskId },
        _max: { order: true },
      });
      const step = await prisma.subtask.create({
        data: {
          taskId: params.taskId,
          title: params.title,
          order: (max._max.order ?? -1) + 1,
        },
        select: { id: true, title: true, done: true },
      });
      await logActivity(params.taskId, ctx.user.id, "subtask_added", params.title);
      await recomputeTaskProgress(params.taskId);
      return step;
    },
  },

  complete_step: {
    scope: "write",
    describe: "Tick a checklist step off (or reopen it with done=false).",
    schema: z.object({ stepId: idSchema, done: z.boolean().default(true) }).strict(),
    run: async (ctx, params: { stepId: string; done: boolean }) => {
      const step = await prisma.subtask.findUnique({ where: { id: params.stepId } });
      if (!step) throw new McpError("step not found", 404);
      await assertCanAct(ctx, step.taskId); // also enforces tenant scope
      const updated = await prisma.subtask.update({
        where: { id: params.stepId },
        data: {
          done: params.done,
          completedAt: params.done ? new Date() : null,
          completedBy: params.done ? ctx.user.id : null,
        },
        select: { id: true, title: true, done: true },
      });
      await logActivity(
        step.taskId,
        ctx.user.id,
        params.done ? "subtask_done" : "subtask_reopened",
        step.title
      );
      await recomputeTaskProgress(step.taskId);
      return updated;
    },
  },

  upload_attachment: {
    scope: "write",
    describe: "Attach a file to a task. Content is base64; the MIME type must be on the allowlist.",
    schema: z
      .object({
        taskId: idSchema,
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(150),
        contentBase64: z.string().min(1),
      })
      .strict(),
    run: async (
      ctx,
      params: { taskId: string; fileName: string; mimeType: string; contentBase64: string }
    ) => {
      await assertCanAct(ctx, params.taskId);

      if (!ALLOWED_MIME.includes(params.mimeType)) {
        throw new McpError(`mime type not allowed: ${params.mimeType}`, 415);
      }
      // Extension comes from the validated MIME, NEVER from the supplied
      // filename — the same rule that keeps a ".html" upload off the disk
      // (security audit 2026-07).
      const ext = MIME_EXTENSION[params.mimeType];
      if (!ext) throw new McpError(`mime type not allowed: ${params.mimeType}`, 415);

      let bytes: Buffer;
      try {
        bytes = Buffer.from(params.contentBase64, "base64");
      } catch {
        throw new McpError("contentBase64 is not valid base64", 400);
      }
      if (bytes.length === 0) throw new McpError("empty file", 400);
      if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new McpError(`file too large (max ${MAX_UPLOAD_BYTES} bytes)`, 413);
      }

      const safeName = `${randomBytes(12).toString("hex")}${ext}`;
      try {
        await mkdir(UPLOAD_ROOT, { recursive: true });
        await writeFile(path.join(UPLOAD_ROOT, safeName), bytes);
      } catch {
        throw new McpError("write failed (upload volume not writable)", 500);
      }

      // Keep only the basename: a path in the display name would be confusing
      // at best and misleading in the activity log at worst.
      const displayName = path.basename(params.fileName);
      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId: params.taskId,
          fileName: displayName,
          filePath: `/uploads/${safeName}`,
          mimeType: params.mimeType,
          sizeBytes: bytes.length,
          uploadedBy: ctx.user.id,
        },
        select: { id: true, fileName: true, sizeBytes: true, mimeType: true },
      });
      await logActivity(params.taskId, ctx.user.id, "attachment", displayName);
      return {
        ...attachment,
        downloadUrl: `/download/attachment/${attachment.id}`,
      };
    },
  },

  create_project: {
    scope: "write",
    describe: "Create a project (admins only).",
    schema: z
      .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).optional(),
        color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#6366f1"),
      })
      .strict(),
    run: async (ctx, params: { name: string; description?: string; color: string }) => {
      // Project creation is an admin action in the UI; SubAdmin reads only.
      if (!isAdminRole(ctx.user.role)) throw new McpError("forbidden", 403);
      const project = await prisma.project.create({
        data: {
          name: params.name,
          description: params.description || null,
          color: params.color,
          createdByUserId: ctx.user.id,
          tenantId: ctx.tenant.id,
        },
        select: { id: true, name: true, description: true, color: true },
      });
      return project;
    },
  },
};

/** Names of every operation, for the MCP server's tools/list. */
export function opNames(): string[] {
  return Object.keys(OPS);
}

/**
 * Which operations a context may actually invoke — used by `whoami`-style
 * discovery so a read-only token does not advertise write tools.
 */
export function availableOps(scopes: Set<ApiScope>): string[] {
  return Object.entries(OPS)
    .filter(([, op]) => (op.scope === "write" ? scopes.has("write") : true))
    .map(([name]) => name);
}

/** True when this role is allowed tenant-wide reads (used for reporting hints). */
export function isReporter(role: string): boolean {
  return isStaffRole(role);
}
