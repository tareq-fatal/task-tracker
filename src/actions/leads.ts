"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { canAccessProject } from "@/lib/task-access";
import { parseLeadInput } from "@/lib/leads";

// Leads je Projekt (TOF-0782, Tarek 28.10.2026). Sehen/bearbeiten darf, wer
// das Projekt öffnen darf (canAccessProject). Jede Abfrage filtert nach
// tenantId UND projectId (Wächter: lib/tenant-isolation.test.ts).
// Archivieren statt Löschen — es gibt bewusst keine Lösch-Action.

export type LeadFormState = { ok?: boolean; error?: string };

/** Projekt im aktiven Mandanten, nicht gelöscht, und für diesen Benutzer offen. */
async function leadProjectContext(projectId: string) {
  const { user, tenant } = await requireTenant();
  if (!projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  if (!project || !(await canAccessProject(user, tenant.id, project.id))) return null;
  return { user, tenantId: tenant.id, projectId: project.id };
}

/** Lead anlegen (ohne leadId) oder bearbeiten (mit leadId). */
export async function saveLeadAction(
  _prev: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const ctx = await leadProjectContext(String(formData.get("projectId") ?? ""));
  if (!ctx) return { error: "NOT_FOUND" };

  const parsed = parseLeadInput({
    company: formData.get("company"),
    contact: formData.get("contact"),
    channel: formData.get("channel"),
    status: formData.get("status"),
    nextAction: formData.get("nextAction"),
    nextActionAt: formData.get("nextActionAt"),
    notes: formData.get("notes"),
  });
  if (!parsed.ok) return { error: parsed.error };

  const leadId = String(formData.get("leadId") ?? "");
  if (leadId) {
    const res = await prisma.lead.updateMany({
      where: { id: leadId, tenantId: ctx.tenantId, projectId: ctx.projectId },
      data: parsed.value,
    });
    if (res.count !== 1) return { error: "NOT_FOUND" };
  } else {
    await prisma.lead.create({
      data: {
        ...parsed.value,
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        createdById: ctx.user.id,
      },
    });
  }
  revalidatePath(`/projects/${ctx.projectId}/leads`);
  return { ok: true };
}

/** Archivieren / Wiederherstellen (kein Löschen). */
export async function setLeadArchivedAction(formData: FormData): Promise<void> {
  const ctx = await leadProjectContext(String(formData.get("projectId") ?? ""));
  if (!ctx) return;
  const leadId = String(formData.get("leadId") ?? "");
  const archived = formData.get("archived") === "1";
  await prisma.lead.updateMany({
    where: { id: leadId, tenantId: ctx.tenantId, projectId: ctx.projectId },
    data: { archivedAt: archived ? new Date() : null },
  });
  revalidatePath(`/projects/${ctx.projectId}/leads`);
}
