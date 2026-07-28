import "server-only";
import { prisma } from "./prisma";
import {
  getGraphAppToken,
  listBuckets,
  listPlanTasks,
  patchTask,
  createTask,
  isGraphConfigured,
} from "./graph";
import {
  diffPlannerTasks,
  type LocalTaskLite,
  type SyncDirection,
} from "./planner-sync";
import type { TaskPriority, TaskStatus } from "./enums";

export type SyncResult = {
  ok: boolean;
  summary: string;
  counts?: { createLocal: number; updateLocal: number; pushRemote: number; createRemote: number };
};

async function attributableUserId(tenantId: string): Promise<string | null> {
  const u = await prisma.user.findFirst({
    where: { tenantId, role: { in: ["Admin", "SuperAdmin"] } },
    select: { id: true },
  });
  return u?.id ?? (await prisma.user.findFirst({ where: { tenantId }, select: { id: true } }))?.id ?? null;
}

/** Run one configured sync. Pure mapping is in planner-sync.ts; this does the I/O. */
export async function runPlannerSync(syncId: string): Promise<SyncResult> {
  const sync = await prisma.plannerSync.findUnique({ where: { id: syncId } });
  if (!sync) return { ok: false, summary: "not found" };
  if (!sync.enabled) return { ok: false, summary: "disabled" };
  if (!isGraphConfigured()) {
    await mark(syncId, "Graph not configured (set Azure env)");
    return { ok: false, summary: "Graph not configured" };
  }

  try {
    const token = await getGraphAppToken();
    const buckets = await listBuckets(token, sync.planId);
    const bucketNames = Object.fromEntries(buckets.map((b) => [b.id, b.name]));
    const firstBucketId = buckets[0]?.id ?? null;
    const remote = await listPlanTasks(token, sync.planId);
    const etagById = new Map(remote.map((r) => [r.id, r.etag]));

    const localRows = await prisma.task.findMany({
      where: { tenantId: sync.tenantId, projectId: sync.projectId },
    });
    const local: LocalTaskLite[] = localRows.map((t) => ({
      id: t.id,
      externalId: t.externalId,
      title: t.title,
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      progress: t.progress,
    }));

    const plan = diffPlannerTasks(
      remote,
      local,
      sync.direction as SyncDirection,
      bucketNames
    );

    const creator = await attributableUserId(sync.tenantId);

    // --- apply locally (pull / two-way) ---
    if (creator) {
      for (const c of plan.createLocal) {
        await prisma.task.create({
          data: {
            title: c.title,
            status: c.status,
            priority: c.priority,
            progress: c.progress,
            dueDate: c.dueDate,
            externalId: c.externalId,
            bucket: c.bucket,
            tenantId: sync.tenantId,
            projectId: sync.projectId,
            createdByUserId: creator,
          },
        });
      }
    }
    for (const u of plan.updateLocal) {
      await prisma.task.update({
        where: { id: u.id },
        data: {
          title: u.title,
          status: u.status,
          priority: u.priority,
          progress: u.progress,
          dueDate: u.dueDate,
          bucket: u.bucket,
        },
      });
    }

    // --- apply remotely (push / two-way) ---
    for (const p of plan.pushRemote) {
      const etag = etagById.get(p.graphTaskId);
      if (etag) await patchTask(token, p.graphTaskId, etag, p.patch);
    }
    for (const c of plan.createRemote) {
      if (!c.id) continue;
      const created = await createTask(token, sync.planId, firstBucketId, {
        title: c.title,
      });
      // patch progress/priority then link the local task to the new remote id
      await prisma.task.update({
        where: { id: c.id },
        data: { externalId: created.id },
      });
    }

    const counts = {
      createLocal: plan.createLocal.length,
      updateLocal: plan.updateLocal.length,
      pushRemote: plan.pushRemote.length,
      createRemote: plan.createRemote.length,
    };
    const summary = `ok: +${counts.createLocal} local, ~${counts.updateLocal} local, →${counts.pushRemote} remote, +${counts.createRemote} remote`;
    await mark(syncId, summary);
    return { ok: true, summary, counts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync error";
    await mark(syncId, `error: ${msg}`);
    return { ok: false, summary: msg };
  }
}

async function mark(syncId: string, status: string) {
  await prisma.plannerSync.update({
    where: { id: syncId },
    data: { lastSyncedAt: new Date(), lastStatus: status },
  });
}

/** Run every sync that is due (used by the cron endpoint). */
export async function runDueSyncs(): Promise<{ ran: number }> {
  const all = await prisma.plannerSync.findMany({ where: { enabled: true } });
  const now = Date.now();
  let ran = 0;
  for (const s of all) {
    const due =
      !s.lastSyncedAt ||
      now - s.lastSyncedAt.getTime() >= s.intervalMin * 60 * 1000;
    if (due) {
      await runPlannerSync(s.id);
      ran++;
    }
  }
  return { ran };
}
