"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { taskVisibility } from "@/lib/task-access";
import { MAX_UPLOAD_BYTES } from "@/lib/validation";

/* ------------------------------------------------------------------ */
/* Rich-text editor support: @mention / #task autocomplete + images    */
/* ------------------------------------------------------------------ */

export type MentionUser = { id: string; username: string; name: string };

/** Tenant users matching `query` — feeds the @mention autocomplete. */
export async function searchMentionUsersAction(
  query: string
): Promise<MentionUser[]> {
  const { tenant } = await requireTenant();
  const q = query.trim();
  const users = await prisma.user.findMany({
    where: {
      tenantId: tenant.id,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { username: { contains: q } },
            ],
          }
        : {}),
    },
    select: { id: true, username: true, name: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  return users;
}

export type TaskRef = { id: string; title: string; status: string };

/** Tasks visible to the current user matching `query` — feeds #references. */
export async function searchTaskRefsAction(query: string): Promise<TaskRef[]> {
  const { user, tenant } = await requireTenant();
  const q = query.trim();
  const tasks = await prisma.task.findMany({
    where: {
      ...(await taskVisibility(user, tenant.id)),
      ...(q ? { title: { contains: q } } : {}),
    },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return tasks;
}

const IMAGE_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Store a pasted/selected image and return its URL for inline embedding.
 * Same storage as task attachments (public/uploads) but not tied to a task —
 * the editor is also used on the "new task" form where no task exists yet.
 */
export async function uploadEditorImageAction(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  await requireTenant(); // auth + tenant gate; throws when unauthenticated

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "TOO_LARGE" };
  if (!IMAGE_MIME.includes(file.type)) return { error: "BAD_TYPE" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || `.${file.type.split("/")[1]}`;
  const safeName = `${randomBytes(12).toString("hex")}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), bytes);

  return { url: `/uploads/${safeName}` };
}
