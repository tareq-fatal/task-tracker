"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import {
  parseImportFile,
  validateTaskRows,
  validateUserRows,
  validateProjectRows,
  isImportEntity,
  type ImportEntity,
  type RowReport,
  type TaskPayload,
  type UserPayload,
  type ProjectPayload,
  type ValidationCtx,
} from "@/lib/bulk-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // stays under the 6mb server-action body limit
const CREATE_CHUNK = 500; // rows per createMany (Postgres bind-parameter headroom)

export type BulkPreview = {
  ok: boolean;
  error?: string; // NO_FILE | BAD_TYPE | TOO_LARGE | EMPTY | MISSING_COLUMNS | TOO_MANY_ROWS | FORBIDDEN
  missingColumns?: string[];
  entity?: ImportEntity;
  total?: number;
  createCount?: number;
  skipCount?: number;
  errorCount?: number;
  rows?: RowReport[];
};

export type BulkResult = {
  ok: boolean;
  error?: string; // preview errors | HAS_ERRORS | NOTHING_TO_IMPORT | WRITE_FAILED
  entity?: ImportEntity;
  created?: number;
  skipped?: number;
  errors?: number;
  rows?: RowReport[]; // error rows when HAS_ERRORS aborts the import
  /** temp credentials for users created without a password — shown once */
  credentials?: { username: string; password: string }[];
};

function readEntity(formData: FormData): ImportEntity | null {
  const e = String(formData.get("entity") ?? "");
  return isImportEntity(e) ? e : null;
}

async function readFile(formData: FormData): Promise<{ buf?: Buffer; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_FILE_BYTES) return { error: "TOO_LARGE" };
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) return { error: "BAD_TYPE" };
  return { buf: Buffer.from(await file.arrayBuffer()) };
}

/** Build only the lookups the given entity needs (single queries, map-based). */
async function buildCtx(entity: ImportEntity, tenantId: string): Promise<ValidationCtx> {
  const ctx: ValidationCtx = {
    existingTaskKeys: new Set(),
    projectsByName: new Map(),
    usersByHandle: new Map(),
    existingUsernames: new Set(),
    existingEmails: new Set(),
    existingProjectNames: new Set(),
  };

  if (entity === "tasks" || entity === "projects") {
    const projects = await prisma.project.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    for (const p of projects) {
      ctx.projectsByName.set(p.name.toLowerCase(), p.id);
      ctx.existingProjectNames.add(p.name.toLowerCase());
    }
  }

  if (entity === "tasks") {
    const [tasks, users] = await Promise.all([
      prisma.task.findMany({
        where: { tenantId },
        select: { title: true, projectId: true },
      }),
      prisma.user.findMany({
        where: { tenantId },
        select: { id: true, username: true, email: true },
      }),
    ]);
    const projectNameById = new Map<string, string>();
    for (const [name, id] of ctx.projectsByName) projectNameById.set(id, name);
    for (const t of tasks) {
      const pName = t.projectId ? (projectNameById.get(t.projectId) ?? "") : "";
      ctx.existingTaskKeys.add(`${t.title.toLowerCase()}|${pName}`);
    }
    for (const u of users) {
      ctx.usersByHandle.set(u.username.toLowerCase(), u.id);
      if (u.email) ctx.usersByHandle.set(u.email.toLowerCase(), u.id);
    }
  }

  if (entity === "users") {
    // usernames are globally unique; emails unique within the tenant
    const [all, tenantUsers] = await Promise.all([
      prisma.user.findMany({ select: { username: true } }),
      prisma.user.findMany({ where: { tenantId }, select: { email: true } }),
    ]);
    for (const u of all) ctx.existingUsernames.add(u.username.toLowerCase());
    for (const u of tenantUsers) if (u.email) ctx.existingEmails.add(u.email.toLowerCase());
  }

  return ctx;
}

type Validated = {
  reports: RowReport[];
  taskPayloads: TaskPayload[];
  userPayloads: UserPayload[];
  projectPayloads: ProjectPayload[];
};

async function parseAndValidate(
  entity: ImportEntity,
  buf: Buffer,
  tenantId: string
): Promise<{ error?: string; missingColumns?: string[]; validated?: Validated }> {
  const parsed = parseImportFile(buf, entity);
  if (!parsed.ok) return { error: parsed.error, missingColumns: parsed.missingColumns };

  const ctx = await buildCtx(entity, tenantId);
  const out: Validated = { reports: [], taskPayloads: [], userPayloads: [], projectPayloads: [] };

  if (entity === "tasks") {
    const { reports, payloads } = validateTaskRows(parsed.rows, ctx);
    out.reports = reports;
    out.taskPayloads = payloads.filter((p): p is TaskPayload => p !== null);
  } else if (entity === "users") {
    const { reports, payloads } = validateUserRows(parsed.rows, ctx);
    out.reports = reports;
    out.userPayloads = payloads.filter((p): p is UserPayload => p !== null);
  } else {
    const { reports, payloads } = validateProjectRows(parsed.rows, ctx);
    out.reports = reports;
    out.projectPayloads = payloads.filter((p): p is ProjectPayload => p !== null);
  }
  return { validated: out };
}

function counts(reports: RowReport[]) {
  let create = 0, skip = 0, error = 0;
  for (const r of reports) {
    if (r.status === "create") create++;
    else if (r.status === "skip") skip++;
    else error++;
  }
  return { create, skip, error };
}

export async function previewBulkImportAction(
  _prev: BulkPreview,
  formData: FormData
): Promise<BulkPreview> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { ok: false, error: "FORBIDDEN" };

  const entity = readEntity(formData);
  if (!entity) return { ok: false, error: "BAD_TYPE" };
  const { buf, error } = await readFile(formData);
  if (!buf) return { ok: false, error };

  const res = await parseAndValidate(entity, buf, tenant.id);
  if (!res.validated) {
    return { ok: false, error: res.error, missingColumns: res.missingColumns, entity };
  }

  const c = counts(res.validated.reports);
  return {
    ok: true,
    entity,
    total: res.validated.reports.length,
    createCount: c.create,
    skipCount: c.skip,
    errorCount: c.error,
    rows: res.validated.reports,
  };
}

function generateTempPassword(): string {
  return `Task-${randomBytes(4).toString("hex")}`;
}

/** Hash with limited concurrency — argon2 is CPU-bound. */
async function hashAll(passwords: string[]): Promise<string[]> {
  const out: string[] = new Array(passwords.length);
  const CONCURRENCY = 8;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, passwords.length) }, async () => {
      while (next < passwords.length) {
        const i = next++;
        out[i] = await hashPassword(passwords[i]);
      }
    })
  );
  return out;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

export async function runBulkImportAction(
  _prev: BulkResult,
  formData: FormData
): Promise<BulkResult> {
  const { user: admin, tenant } = await requireTenant();
  if (!isAdminRole(admin.role)) return { ok: false, error: "FORBIDDEN" };

  const entity = readEntity(formData);
  if (!entity) return { ok: false, error: "BAD_TYPE" };
  const { buf, error } = await readFile(formData);
  if (!buf) return { ok: false, error };
  const skipErrors = formData.get("skipErrors") === "1";

  // Re-parse + re-validate — never trust a stale preview.
  const res = await parseAndValidate(entity, buf, tenant.id);
  if (!res.validated) {
    return { ok: false, error: res.error, entity };
  }
  const { reports } = res.validated;
  const c = counts(reports);

  // All-or-nothing on validation errors unless the admin opted to skip them.
  if (c.error > 0 && !skipErrors) {
    return {
      ok: false,
      error: "HAS_ERRORS",
      entity,
      errors: c.error,
      rows: reports.filter((r) => r.status === "error"),
    };
  }
  if (c.create === 0) {
    return { ok: false, error: "NOTHING_TO_IMPORT", entity, skipped: c.skip, errors: c.error };
  }

  let credentials: { username: string; password: string }[] = [];

  try {
    if (entity === "projects") {
      const data = res.validated.projectPayloads.map((p) => ({
        name: p.name,
        description: p.description,
        color: p.color,
        createdByUserId: admin.id,
        tenantId: tenant.id,
      }));
      await prisma.$transaction(
        async (tx) => {
          for (const chunk of chunks(data, CREATE_CHUNK)) {
            await tx.project.createMany({ data: chunk });
          }
        },
        { maxWait: 15_000, timeout: 120_000 }
      );
    } else if (entity === "users") {
      const payloads = res.validated.userPayloads;
      // Hash outside the transaction — argon2 for 500+ rows would blow the txn window.
      const plain = payloads.map((p) => p.password ?? generateTempPassword());
      const hashes = await hashAll(plain);
      credentials = payloads
        .map((p, i) => ({ generated: p.password === null, username: p.username, password: plain[i] }))
        .filter((x) => x.generated)
        .map(({ username, password }) => ({ username, password }));
      const data = payloads.map((p, i) => ({
        name: p.name,
        username: p.username,
        email: p.email,
        passwordHash: hashes[i],
        mustChangePassword: p.password === null,
        role: p.role,
        ...(p.locale ? { locale: p.locale } : {}),
        hasSeenTour: false,
        tenantId: tenant.id,
      }));
      await prisma.$transaction(
        async (tx) => {
          for (const chunk of chunks(data, CREATE_CHUNK)) {
            await tx.user.createMany({ data: chunk });
          }
        },
        { maxWait: 15_000, timeout: 120_000 }
      );
    } else {
      const now = new Date();
      const data = res.validated.taskPayloads.map((p) => ({
        title: p.title,
        description: p.description,
        status: p.status,
        priority: p.priority,
        type: p.type,
        projectId: p.projectId,
        assignedToUserId: p.assignedToUserId,
        dueDate: p.dueDate,
        storyPoints: p.storyPoints,
        estimatedHours: p.estimatedHours,
        progress: p.status === "Done" ? 100 : 0,
        completedAt: p.status === "Done" ? now : null,
        createdByUserId: admin.id,
        tenantId: tenant.id,
      }));
      await prisma.$transaction(
        async (tx) => {
          for (const chunk of chunks(data, CREATE_CHUNK)) {
            const created = await tx.task.createManyAndReturn({
              data: chunk,
              select: { id: true, assignedToUserId: true },
            });
            // #13 — mirror the primary assignee into TaskAssignee
            const assigneeRows = created
              .filter((t) => t.assignedToUserId)
              .map((t) => ({ taskId: t.id, userId: t.assignedToUserId! }));
            if (assigneeRows.length > 0) {
              await tx.taskAssignee.createMany({ data: assigneeRows });
            }
            await tx.activityLog.createMany({
              data: created.map((t) => ({
                taskId: t.id,
                userId: admin.id,
                type: "created",
                detail: "Bulk import",
              })),
            });
          }
        },
        { maxWait: 15_000, timeout: 120_000 }
      );
    }
  } catch (e) {
    // Interactive transaction → everything above is rolled back as one batch.
    console.error("[bulk-import] write failed, batch rolled back:", e);
    return { ok: false, error: "WRITE_FAILED", entity };
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/admin/users");
  revalidatePath("/projects");
  revalidatePath("/board");
  revalidatePath("/list");

  return {
    ok: true,
    entity,
    created: c.create,
    skipped: c.skip,
    errors: c.error,
    ...(credentials.length > 0 ? { credentials } : {}),
  };
}
