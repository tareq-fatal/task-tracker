import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { resolveUploadPath } from "@/lib/upload-paths";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { isInlineViewable, isImageMime } from "@/lib/attachment-view";
import { THUMB_MIME } from "@/lib/thumbnail";

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

  const params_ = new URL(req.url).searchParams;

  // `?thumb=1` serves the small WebP preview written at upload time, so a list
  // of 164 tasks doesn't pull 164 full-size photos. It runs AFTER the same
  // tenant + visibility check as the original — a preview is the picture, and
  // must not be reachable one inch wider than the file it previews. No preview
  // (older rows, non-images) → fall through to the original, still inline.
  const wantThumb = params_.get("thumb") === "1" && isImageMime(att.mimeType);
  const useThumb = wantThumb && !!att.thumbPath;

  // filePath is "/uploads/<hash>.<ext>" → var/uploads/<hash>.<ext>
  const abs = resolveUploadPath(useThumb ? att.thumbPath! : att.filePath);
  let data = abs ? await readFile(abs).catch(() => null) : null;
  let serveMime = useThumb ? THUMB_MIME : att.mimeType;
  // A missing preview file (e.g. volume restored without it) must not 404 the
  // attachment — fall back to the original, with the original's type.
  if (!data && useThumb) {
    const orig = resolveUploadPath(att.filePath);
    data = orig ? await readFile(orig).catch(() => null) : null;
    serveMime = att.mimeType;
  }
  if (!data) return new NextResponse("Not found", { status: 404 });

  const inline =
    (params_.get("inline") === "1" || wantThumb) && isInlineViewable(serveMime);

  return new NextResponse(data, {
    headers: {
      "Content-Type": inline ? serveMime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Content-Length": String(data.length),
      // Previews are re-requested on every list render; upload paths are
      // content-hashed, so a short PRIVATE (browser-only, never a shared
      // proxy) cache is safe and keeps a 164-row list from re-downloading
      // every picture. Originals stay no-store as before.
      "Cache-Control": useThumb ? "private, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
