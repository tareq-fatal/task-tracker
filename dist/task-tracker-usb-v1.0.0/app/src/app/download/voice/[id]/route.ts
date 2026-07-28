import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";

// Serve a voice note INLINE (audio/* content type) so <audio> can play it.
// Supports single-range requests — browsers need 206 responses to seek.
// Access-checked like attachments: same tenant + can view the task.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, tenant } = await requireTenant();
  const note = await prisma.voiceNote.findUnique({
    where: { id: params.id },
    include: { task: { select: { tenantId: true, createdByUserId: true, assignedToUserId: true } } },
  });
  if (!note || note.task.tenantId !== tenant.id) return new NextResponse("Not found", { status: 404 });
  // Same visibility as the task detail page: admin, creator, or ANY assignee
  // (co-assignees included, #13).
  let canView =
    isAdminRole(user.role) ||
    note.task.createdByUserId === user.id ||
    note.task.assignedToUserId === user.id;
  if (!canView) {
    const assignee = await prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: note.taskId, userId: user.id } },
      select: { id: true },
    });
    canView = Boolean(assignee);
  }
  if (!canView) return new NextResponse("Forbidden", { status: 403 });

  // filePath is "/uploads/<hash>.<ext>" → public/uploads/<hash>.<ext>
  const abs = path.join(process.cwd(), "public", note.filePath.replace(/^\/+/, ""));
  const data = await readFile(abs).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const baseHeaders = {
    "Content-Type": note.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? parseInt(m[1], 10) : data.length - parseInt(m[2], 10);
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), data.length - 1) : data.length - 1;
    if (isNaN(start) || start < 0 || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${data.length}` },
      });
    }
    return new NextResponse(data.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new NextResponse(data, {
    headers: { ...baseHeaders, "Content-Length": String(data.length) },
  });
}
