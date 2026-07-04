import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";

// Serve an attachment as a forced DOWNLOAD (never inline) — Content-Disposition
// attachment + octet-stream. Access-checked: same tenant + can view the task.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, tenant } = await requireTenant();
  const att = await prisma.taskAttachment.findUnique({
    where: { id: params.id },
    include: { task: { select: { tenantId: true, createdByUserId: true, assignedToUserId: true } } },
  });
  if (!att || att.task.tenantId !== tenant.id) return new NextResponse("Not found", { status: 404 });
  const canView = isAdminRole(user.role) || att.task.createdByUserId === user.id || att.task.assignedToUserId === user.id;
  if (!canView) return new NextResponse("Forbidden", { status: 403 });

  // filePath is "/uploads/<hash>.<ext>" → public/uploads/<hash>.<ext>
  const abs = path.join(process.cwd(), "public", att.filePath.replace(/^\/+/, ""));
  const data = await readFile(abs).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
    },
  });
}
