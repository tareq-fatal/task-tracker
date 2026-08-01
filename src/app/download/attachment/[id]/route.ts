import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { resolveUploadPath } from "@/lib/upload-paths";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { isInlineViewable } from "@/lib/attachment-view";

// Serve an attachment. Access-checked: same tenant + can view the task.
// `?inline=1` renders safe types (images, PDF) IN PLACE — the browser and the
// Capacitor WebView can display them — instead of forcing a download (which the
// Android WebView silently drops). Everything else stays a hardened
// octet-stream download. `nosniff` is always set so a declared type can't be
// re-sniffed into something executable.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  let auth;
  try {
    auth = await requireTenant();
  } catch {
    // No session → clean 401 instead of an unhandled-throw 500.
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { user, tenant } = auth;
  const att = await prisma.taskAttachment.findUnique({
    where: { id: params.id },
    include: {
      task: {
        select: {
          tenantId: true,
          createdByUserId: true,
          assignedToUserId: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  if (!att || att.task.tenantId !== tenant.id) return new NextResponse("Not found", { status: 404 });
  if (att.deletedAt) return new NextResponse("Not found", { status: 404 }); // soft-deleted
  // Same visibility as the task detail page: admin, creator, or ANY assignee —
  // co-assignees (#13 TaskAssignee) included, not just the primary Hauptkopf.
  const canView =
    isAdminRole(user.role) ||
    att.task.createdByUserId === user.id ||
    att.task.assignedToUserId === user.id ||
    att.task.assignees.some((a) => a.userId === user.id);
  if (!canView) return new NextResponse("Forbidden", { status: 403 });

  // filePath is "/uploads/<hash>.<ext>" → public/uploads/<hash>.<ext>
  const abs = resolveUploadPath(att.filePath);
  if (!abs) return new NextResponse("Not found", { status: 404 });
  const data = await readFile(abs).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const inline =
    new URL(req.url).searchParams.get("inline") === "1" && isInlineViewable(att.mimeType);

  return new NextResponse(data, {
    headers: {
      "Content-Type": inline ? att.mimeType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
