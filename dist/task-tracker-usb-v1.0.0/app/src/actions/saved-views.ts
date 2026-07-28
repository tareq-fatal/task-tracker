"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export type SavedViewState = { ok?: boolean; error?: string };
export type SavedViewLite = { id: string; name: string; view: string; entityId: string | null };

const VIEWS = ["all", "person", "team", "project", "operations"];

export async function getMySavedViews(): Promise<SavedViewLite[]> {
  const { user } = await requireTenant();
  const rows = await prisma.savedView.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, view: r.view, entityId: r.entityId }));
}

export async function saveViewAction(name: string, view: string, entityId: string | null): Promise<SavedViewState> {
  const { user, tenant } = await requireTenant();
  const clean = name.trim();
  if (!clean) return { error: "EMPTY" };
  if (!VIEWS.includes(view)) return { error: "BAD_VIEW" };
  await prisma.savedView.create({
    data: { userId: user.id, tenantId: tenant.id, name: clean.slice(0, 60), view, entityId: entityId || null },
  });
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteSavedViewAction(id: string): Promise<SavedViewState> {
  const { user } = await requireTenant();
  // scoped to the owner — a user can only delete their own saved views
  const res = await prisma.savedView.deleteMany({ where: { id, userId: user.id } });
  if (res.count === 0) return { error: "NOT_FOUND" };
  revalidatePath("/tasks");
  return { ok: true };
}
