"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isTaskStatus, isTaskPriority } from "@/lib/enums";
import { TRIGGER_TYPES, ACTION_TYPES } from "@/lib/automation";

export type RuleState = { ok?: boolean; error?: string };
export type RuleLite = {
  id: string; name: string; enabled: boolean;
  triggerType: string; triggerValue: string | null; actionType: string; actionValue: string;
};

async function requireAdmin() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return { user, tenant };
}

export async function getRules(): Promise<RuleLite[]> {
  const { tenant } = await requireTenant();
  const rules = await prisma.automationRule.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  return rules.map((r) => ({
    id: r.id, name: r.name, enabled: r.enabled,
    triggerType: r.triggerType, triggerValue: r.triggerValue, actionType: r.actionType, actionValue: r.actionValue,
  }));
}

function valueValidForAction(actionType: string, value: string): boolean {
  if (actionType === "set_status") return isTaskStatus(value);
  if (actionType === "set_priority") return isTaskPriority(value);
  return false;
}

export async function addRuleAction(
  name: string, triggerType: string, triggerValue: string, actionType: string, actionValue: string
): Promise<RuleState> {
  const { tenant } = await requireAdmin();
  const clean = name.trim();
  if (!clean) return { error: "EMPTY" };
  if (!TRIGGER_TYPES.includes(triggerType as never)) return { error: "BAD_TRIGGER" };
  if (!ACTION_TYPES.includes(actionType as never)) return { error: "BAD_ACTION" };
  if (!valueValidForAction(actionType, actionValue)) return { error: "BAD_ACTION_VALUE" };
  // trigger value required except for "created"
  const tv = triggerType === "created" ? null : triggerValue;
  if (triggerType !== "created" && !tv) return { error: "NEED_TRIGGER_VALUE" };

  await prisma.automationRule.create({
    data: { tenantId: tenant.id, name: clean, triggerType, triggerValue: tv, actionType, actionValue },
  });
  revalidatePath("/admin/automation");
  return { ok: true };
}

export async function toggleRuleAction(id: string, enabled: boolean): Promise<RuleState> {
  const { tenant } = await requireAdmin();
  const rule = await prisma.automationRule.findFirst({ where: { id, tenantId: tenant.id } });
  if (!rule) return { error: "NOT_FOUND" };
  await prisma.automationRule.update({ where: { id }, data: { enabled } });
  revalidatePath("/admin/automation");
  return { ok: true };
}

export async function deleteRuleAction(id: string): Promise<RuleState> {
  const { tenant } = await requireAdmin();
  const rule = await prisma.automationRule.findFirst({ where: { id, tenantId: tenant.id } });
  if (!rule) return { error: "NOT_FOUND" };
  await prisma.automationRule.delete({ where: { id } });
  revalidatePath("/admin/automation");
  return { ok: true };
}
