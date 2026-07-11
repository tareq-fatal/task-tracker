import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll an export job's status (tenant-scoped). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let ctx;
  try {
    ctx = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const job = await prisma.exportJob.findFirst({
    where: { id: params.id, tenantId: ctx.tenant.id },
    select: {
      id: true, status: true, kind: true, format: true, taskCount: true,
      fileName: true, sizeBytes: true, error: true, token: true,
      createdAt: true, completedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: job.id,
    status: job.status,
    kind: job.kind,
    format: job.format,
    taskCount: job.taskCount,
    fileName: job.fileName,
    sizeBytes: job.sizeBytes,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    // Ready-to-use download link (token-scoped) once the file exists.
    downloadUrl: job.status === "done" ? `/download/export/${job.id}?token=${job.token}` : null,
  });
}
