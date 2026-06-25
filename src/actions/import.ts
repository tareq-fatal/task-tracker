"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { parsePlannerWorkbook, type ParsedWorkbook } from "@/lib/planner-import";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/enums";

const PROJECT_COLOR = "#1d4ed8"; // SAP blue

async function readWorkbook(formData: FormData): Promise<ParsedWorkbook> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("NO_FILE");
  if (
    !file.name.toLowerCase().endsWith(".xlsx") &&
    !file.type.includes("spreadsheet")
  ) {
    throw new Error("BAD_TYPE");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return parsePlannerWorkbook(buf);
}

function breakdown<T extends string>(
  items: { value: T }[],
  keys: readonly T[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  for (const it of items) out[it.value] = (out[it.value] ?? 0) + 1;
  return out;
}

export type ImportPreview = {
  ok: boolean;
  error?: string;
  planName?: string;
  planId?: string;
  taskCount?: number;
  userCount?: number;
  bucketCount?: number;
  statusBreakdown?: Record<string, number>;
  priorityBreakdown?: Record<string, number>;
  sampleTitles?: string[];
  alreadyImported?: number; // tasks with these externalIds already in DB
};

export async function previewImportAction(
  _prev: ImportPreview,
  formData: FormData
): Promise<ImportPreview> {
  await requireAdmin();
  let wb: ParsedWorkbook;
  try {
    wb = await readWorkbook(formData);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "PARSE_ERROR" };
  }

  const externalIds = wb.tasks.map((t) => t.externalId);
  const alreadyImported = await prisma.task.count({
    where: { externalId: { in: externalIds } },
  });

  return {
    ok: true,
    planName: wb.planName,
    planId: wb.planId,
    taskCount: wb.tasks.length,
    userCount: wb.users.length,
    bucketCount: wb.bucketCount,
    statusBreakdown: breakdown(
      wb.tasks.map((t) => ({ value: t.status })),
      TASK_STATUSES
    ),
    priorityBreakdown: breakdown(
      wb.tasks.map((t) => ({ value: t.priority })),
      TASK_PRIORITIES
    ),
    sampleTitles: wb.tasks.slice(0, 8).map((t) => t.title),
    alreadyImported,
  };
}

export type ImportResult = {
  ok: boolean;
  error?: string;
  projectName?: string;
  tasksCreated?: number;
  tasksUpdated?: number;
  usersCreated?: number;
};

export async function runImportAction(
  _prev: ImportResult,
  formData: FormData
): Promise<ImportResult> {
  const admin = await requireAdmin();
  let wb: ParsedWorkbook;
  try {
    wb = await readWorkbook(formData);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "PARSE_ERROR" };
  }

  // 1) Project (idempotent by externalId = plan id)
  const project = await prisma.project.upsert({
    where: { externalId: wb.planId },
    update: { name: wb.planName },
    create: {
      name: wb.planName,
      description: "Importiert aus MS Planner",
      color: PROJECT_COLOR,
      externalId: wb.planId,
      createdByUserId: admin.id,
    },
  });

  // 2) Users (idempotent by email) → map plannerId → our user id
  const userMap = new Map<string, string>();
  let usersCreated = 0;
  for (const u of wb.users) {
    const email = u.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      userMap.set(u.plannerId, existing.id);
      continue;
    }
    const username = email.split("@")[0].toLowerCase();
    const created = await prisma.user.create({
      data: {
        name: u.name,
        username,
        email,
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        role: "User",
        locale: "de",
        hasSeenTour: true,
      },
    });
    userMap.set(u.plannerId, created.id);
    usersCreated++;
  }

  // 3) Tasks (idempotent by externalId) — chunked to bound concurrency
  const existingIds = new Set(
    (
      await prisma.task.findMany({
        where: { externalId: { in: wb.tasks.map((t) => t.externalId) } },
        select: { externalId: true },
      })
    ).map((t) => t.externalId)
  );

  // Sequential upserts — race-free (parallel would conflict on shared keys) and
  // fast enough for ~1k rows on a local/colocated Postgres.
  for (const tk of wb.tasks) {
    const assignee = tk.assigneePlannerId
      ? (userMap.get(tk.assigneePlannerId) ?? null)
      : null;
    const creator = tk.creatorPlannerId
      ? (userMap.get(tk.creatorPlannerId) ?? admin.id)
      : admin.id;
    const common = {
      title: tk.title.slice(0, 500),
      description: tk.notes ? tk.notes.slice(0, 8000) : null,
      status: tk.status,
      priority: tk.priority,
      progress: tk.progress,
      bucket: tk.bucket || null,
      dueDate: tk.dueDate,
      completedAt: tk.completedAt,
      projectId: project.id,
      assignedToUserId: assignee,
    };
    await prisma.task.upsert({
      where: { externalId: tk.externalId },
      update: common,
      create: {
        ...common,
        externalId: tk.externalId,
        createdByUserId: creator,
        ...(tk.createdAt ? { createdAt: tk.createdAt } : {}),
      },
    });
  }

  const tasksUpdated = existingIds.size;
  const tasksCreated = wb.tasks.length - tasksUpdated;

  revalidatePath("/admin/tasks");
  revalidatePath("/projects");
  revalidatePath("/board");

  return {
    ok: true,
    projectName: wb.planName,
    tasksCreated,
    tasksUpdated,
    usersCreated,
  };
}
