"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/enums";
import { classifyQuery, isAllowed } from "@/lib/sql-guard";

const ROW_CAP = 1000;

async function requireSuper() {
  const user = await requireUser();
  if (!isSuperAdmin(user.role)) throw new Error("FORBIDDEN");
  return user;
}

function sanitize(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
  return v;
}

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  mode: "read" | "write";
  error?: string;
};

export async function runQueryAction(sql: string, writeMode: boolean): Promise<QueryResult> {
  const user = await requireSuper();
  const q = classifyQuery(sql);
  const gate = isAllowed(q, writeMode);
  if (!gate.ok) {
    await audit(user, sql, q.dangerous ? "write" : "read", null, gate.reason);
    return { columns: [], rows: [], rowCount: 0, truncated: false, mode: q.readOnly ? "read" : "write", error: gate.reason };
  }

  try {
    if (q.readOnly) {
      const result = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
      const truncated = result.length > ROW_CAP;
      const slice = result.slice(0, ROW_CAP);
      const columns = slice.length ? Object.keys(slice[0]) : [];
      const rows = slice.map((r) => columns.map((c) => sanitize(r[c])));
      await audit(user, sql, "read", result.length);
      return { columns, rows, rowCount: result.length, truncated, mode: "read" };
    } else {
      const count = await prisma.$executeRawUnsafe(sql);
      await audit(user, sql, "write", count);
      return { columns: ["affected_rows"], rows: [[count]], rowCount: count, truncated: false, mode: "write" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query error";
    await audit(user, sql, q.readOnly ? "read" : "write", null, msg);
    return { columns: [], rows: [], rowCount: 0, truncated: false, mode: q.readOnly ? "read" : "write", error: msg };
  }
}

async function audit(
  user: { id: string; name: string },
  sql: string,
  mode: string,
  rowCount: number | null,
  error?: string | null
) {
  await prisma.dbAuditLog
    .create({ data: { userId: user.id, userName: user.name, sql: sql.slice(0, 4000), mode, rowCount: rowCount ?? null, error: error ?? null } })
    .catch(() => {});
}

export type AuditEntry = { id: string; userName: string; sql: string; mode: string; rowCount: number | null; error: string | null; createdAt: string };

export async function getDbAudit(): Promise<AuditEntry[]> {
  await requireSuper();
  const rows = await prisma.dbAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 });
  return rows.map((r) => ({ id: r.id, userName: r.userName, sql: r.sql, mode: r.mode, rowCount: r.rowCount, error: r.error, createdAt: r.createdAt.toISOString() }));
}

export type TenantCounts = { slug: string; name: string; tasks: number; projects: number; teams: number; sprints: number } | null;

/** Preview how much data a purge would remove, so the UI can warn precisely. */
export async function countTenantDataAction(slug: string): Promise<TenantCounts> {
  await requireSuper();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
  const [tasks, projects, teams, sprints] = await Promise.all([
    prisma.task.count({ where: { tenantId: tenant.id } }),
    prisma.project.count({ where: { tenantId: tenant.id } }),
    prisma.team.count({ where: { tenantId: tenant.id } }),
    prisma.sprint.count({ where: { tenantId: tenant.id } }),
  ]);
  return { slug, name: tenant.name, tasks, projects, teams, sprints };
}

/** DANGER: empties a tenant's work data (tasks/projects/teams/sprints). Keeps the
 *  tenant + its users. Requires typing the tenant slug to confirm. SuperAdmin only. */
export async function purgeTenantAction(slug: string, confirm: string): Promise<{ ok: boolean; error?: string; summary?: string }> {
  const user = await requireSuper();
  if (!slug || confirm !== slug) return { ok: false, error: "CONFIRM_MISMATCH" };
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return { ok: false, error: "NOT_FOUND" };

  const tasks = await prisma.task.deleteMany({ where: { tenantId: tenant.id } });
  const sprints = await prisma.sprint.deleteMany({ where: { tenantId: tenant.id } });
  const projects = await prisma.project.deleteMany({ where: { tenantId: tenant.id } });
  const teams = await prisma.team.deleteMany({ where: { tenantId: tenant.id } });

  const summary = `${slug}: -${tasks.count} tasks, -${projects.count} projects, -${teams.count} teams, -${sprints.count} sprints`;
  await audit(user, `[PURGE TENANT] ${summary}`, "purge", tasks.count + projects.count + teams.count + sprints.count);
  revalidatePath("/admin/db");
  return { ok: true, summary };
}
