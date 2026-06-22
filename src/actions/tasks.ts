"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  taskSchema,
  commentSchema,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME,
} from "@/lib/validation";
import { isTaskStatus } from "@/lib/enums";
import { notifyUser } from "@/lib/push";

async function assertCanEdit(taskId: string, user: { id: string; role: string }) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("NOT_FOUND");
  const allowed =
    user.role === "Admin" ||
    task.createdByUserId === user.id ||
    task.assignedToUserId === user.id;
  if (!allowed) throw new Error("FORBIDDEN");
  return task;
}

export type TaskFormState = { error?: string; ok?: boolean };

function parseForm(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "Todo",
    priority: formData.get("priority") ?? "Medium",
    assignedToUserId: formData.get("assignedToUserId") ?? "",
    projectId: formData.get("projectId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
  });
}

export async function createTaskAction(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const user = await requireUser();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }
  const d = parsed.data;

  const task = await prisma.task.create({
    data: {
      title: d.title,
      description: d.description || null,
      status: d.status,
      priority: d.priority,
      assignedToUserId: d.assignedToUserId,
      projectId: d.projectId,
      dueDate: d.dueDate,
      createdByUserId: user.id,
    },
  });

  if (d.assignedToUserId && d.assignedToUserId !== user.id) {
    await notifyUser(d.assignedToUserId, {
      title: "Neue Task zugewiesen",
      body: d.title,
      url: `/tasks/${task.id}`,
    });
  }

  revalidatePath("/");
  revalidatePath("/board");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(
  taskId: string,
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const user = await requireUser();
  const existing = await assertCanEdit(taskId, user);
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }
  const d = parsed.data;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: d.title,
      description: d.description || null,
      status: d.status,
      priority: d.priority,
      assignedToUserId: d.assignedToUserId,
      projectId: d.projectId,
      dueDate: d.dueDate,
    },
  });

  if (
    d.assignedToUserId &&
    d.assignedToUserId !== existing.assignedToUserId &&
    d.assignedToUserId !== user.id
  ) {
    await notifyUser(d.assignedToUserId, {
      title: "Task zugewiesen",
      body: d.title,
      url: `/tasks/${taskId}`,
    });
  }

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

/** Used by the Kanban board drag&drop. */
export async function updateTaskStatusAction(
  taskId: string,
  status: string
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await assertCanEdit(taskId, user);
  if (!isTaskStatus(status)) return { ok: false };

  await prisma.task.update({
    where: { id: taskId },
    data: { status },
  });

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const user = await requireUser();
  await assertCanEdit(taskId, user);
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/");
  revalidatePath("/board");
  redirect("/");
}

export async function addCommentAction(
  taskId: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireUser();
  await assertCanEdit(taskId, user);
  const parsed = commentSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { error: "INVALID" };

  await prisma.taskComment.create({
    data: { taskId, userId: user.id, content: parsed.data.content },
  });

  revalidatePath(`/tasks/${taskId}`);
  return {};
}

export async function uploadAttachmentAction(
  taskId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireUser();
  await assertCanEdit(taskId, user);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "NO_FILE" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "TOO_LARGE" };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "BAD_TYPE" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || "";
  const safeName = `${randomBytes(12).toString("hex")}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), bytes);

  await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.name,
      filePath: `/uploads/${safeName}`,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  revalidatePath(`/tasks/${taskId}`);
  return {};
}
