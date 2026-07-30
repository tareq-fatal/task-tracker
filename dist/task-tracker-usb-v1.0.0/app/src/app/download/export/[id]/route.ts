import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getActiveTenant } from "@/lib/tenant";
import { CONTENT_TYPE } from "@/lib/export/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a completed export. Authorised either by the unguessable token in the
 * link (so the emailed link works without a session) or, failing that, by an
 * active session for the same tenant.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const job = await prisma.exportJob.findUnique({
    where: { id: params.id },
    select: { id: true, token: true, tenantId: true, status: true, filePath: true, fileName: true, format: true },
  });
  if (!job) return new NextResponse("Not found", { status: 404 });

  // Auth: valid token, or a session scoped to the same tenant.
  let authorised = Boolean(token && token === job.token);
  if (!authorised) {
    const ctx = await getActiveTenant();
    authorised = Boolean(ctx && ctx.tenant.id === job.tenantId);
  }
  if (!authorised) return new NextResponse("Forbidden", { status: 403 });

  if (job.status !== "done" || !job.filePath) {
    return new NextResponse("Not ready", { status: 409 });
  }

  let data: Buffer;
  try {
    const abs = path.join(process.cwd(), "public", job.filePath.replace(/^\/+/, ""));
    data = await readFile(abs);
  } catch {
    return new NextResponse("File missing", { status: 410 });
  }

  const contentType =
    job.format === "xlsx" ? CONTENT_TYPE.xlsx : job.format === "pdf" ? CONTENT_TYPE.pdf : "application/octet-stream";
  const fileName = job.fileName ?? `export-${job.id}.${job.format}`;

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
    },
  });
}
