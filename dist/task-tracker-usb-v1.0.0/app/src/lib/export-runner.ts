import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { sendEmail, basicEmailTemplate, emailEnabled } from "@/lib/email";
import { isLocale, type Locale } from "@/lib/enums";
import { generateExport, type ExportTenantCtx } from "@/lib/export/generate";
import { makeExportT } from "@/lib/export/i18n-export";
import { EXPORT_FORMAT, type ExportParams, type ExportKind } from "@/lib/export/types";

const EXPORT_DIR = path.join(process.cwd(), "public", "uploads", "exports");
const PUBLIC_PREFIX = "/uploads/exports";
const MAX_ATTEMPTS = 3;

/** Base URL for emailed download links. */
function appBaseUrl(): string {
  return (process.env.APP_URL || "https://tasks.coastshield.net").replace(/\/+$/, "");
}

export type EnqueueInput = {
  params: ExportParams;
  ctx: ExportTenantCtx;
  taskCount: number;
  user: { id: string; name: string; email: string | null };
};

/** Create a queued export job and return its id + token. */
export async function enqueueExport(input: EnqueueInput): Promise<{ id: string; token: string }> {
  const token = randomBytes(24).toString("hex");
  const job = await prisma.exportJob.create({
    data: {
      token,
      tenantId: input.ctx.tenantId,
      userId: input.user.id,
      userName: input.user.name,
      userEmail: input.user.email,
      locale: input.params.locale,
      kind: input.params.kind,
      format: EXPORT_FORMAT[input.params.kind],
      params: JSON.stringify(input.params),
      status: "pending",
      taskCount: input.taskCount,
    },
    select: { id: true, token: true },
  });
  return job;
}

/** Rebuild the tenant context a queued job needs to render. */
async function tenantCtx(tenantId: string, fallbackUserId: string): Promise<ExportTenantCtx | null> {
  const tn = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true, logo: true, primaryColor: true },
  });
  if (!tn) return null;
  return {
    tenantId: tn.id,
    tenantName: tn.name,
    tenantSlug: tn.slug,
    tenantLogo: tn.logo,
    tenantPrimaryColor: tn.primaryColor,
    fallbackUserId,
  };
}

type JobRow = {
  id: string;
  token: string;
  tenantId: string;
  userId: string;
  userEmail: string | null;
  locale: string;
  params: string;
  attempts: number;
};

/** Generate one job's file, persist it, mark done, and email the requester. */
export async function processExportJob(job: JobRow): Promise<{ ok: boolean; error?: string }> {
  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: "processing", startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    const ctx = await tenantCtx(job.tenantId, job.userId);
    if (!ctx) throw new Error("tenant not found");

    const params = JSON.parse(job.params) as ExportParams;
    const locale: Locale = isLocale(job.locale) ? job.locale : "ar";
    params.locale = locale;

    const gen = await generateExport(params, ctx, new Date());

    await mkdir(EXPORT_DIR, { recursive: true });
    const ext = EXPORT_FORMAT[params.kind as ExportKind];
    const diskName = `${job.id}.${ext}`;
    await writeFile(path.join(EXPORT_DIR, diskName), gen.buffer);

    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "done",
        fileName: gen.fileName,
        filePath: `${PUBLIC_PREFIX}/${diskName}`,
        sizeBytes: gen.buffer.length,
        taskCount: gen.taskCount,
        completedAt: new Date(),
        error: null,
      },
    });

    await notifyReady(job, locale, gen.fileName);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const failed = job.attempts + 1 >= MAX_ATTEMPTS;
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: failed ? "error" : "pending", error },
    });
    return { ok: false, error };
  }
}

async function notifyReady(job: JobRow, locale: Locale, fileName: string): Promise<void> {
  if (!emailEnabled || !job.userEmail) return;
  const t = makeExportT(locale);
  const url = `/download/export/${job.id}?token=${job.token}`;
  const html = basicEmailTemplate(
    t("export.email.subject"),
    t("export.email.body", { file: fileName }),
    url
  );
  await sendEmail({ to: job.userEmail, subject: t("export.email.subject"), html });
}

/** Drain up to `limit` pending export jobs. Called by the cron route. */
export async function runPendingExports(limit = 5): Promise<{ processed: number; ok: number; failed: number }> {
  const jobs = await prisma.exportJob.findMany({
    where: { status: "pending", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, token: true, tenantId: true, userId: true, userEmail: true, locale: true, params: true, attempts: true },
  });

  let ok = 0;
  let failed = 0;
  for (const job of jobs) {
    const res = await processExportJob(job);
    if (res.ok) ok++;
    else failed++;
  }
  return { processed: jobs.length, ok, failed };
}

/**
 * Kick a single job immediately (fire-and-forget) so async exports don't wait
 * for the next cron tick. Errors are swallowed — the cron is the safety net.
 */
export function triggerExportSoon(jobId: string): void {
  void (async () => {
    try {
      const job = await prisma.exportJob.findFirst({
        where: { id: jobId, status: "pending" },
        select: { id: true, token: true, tenantId: true, userId: true, userEmail: true, locale: true, params: true, attempts: true },
      });
      if (job) await processExportJob(job);
    } catch {
      /* ignore — the cron runner will retry pending jobs */
    }
  })();
}
