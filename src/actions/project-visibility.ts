"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { isAffiliation, type Affiliation } from "@/lib/project-visibility/policy";
import { getTenantDisplayLevel, setTenantDisplayLevel } from "@/lib/project-visibility/service";

/**
 * TOF-0967 — Anzeige-Ebene je Firma (Zugehörigkeit je Projekt: actions/projects.ts).
 * Nur Admins ändern etwas; alle anderen bekommen FORBIDDEN ohne Wirkung.
 */

export type VisibilityActionResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "INVALID" };

/** Leere Auswahl (oder alle drei) = Alle. */
export async function setDisplayLevelAction(affiliations: string[]): Promise<VisibilityActionResult> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { ok: false, error: "FORBIDDEN" };
  if (!Array.isArray(affiliations) || !affiliations.every(isAffiliation)) return { ok: false, error: "INVALID" };
  await setTenantDisplayLevel(tenant.id, affiliations);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Für Banner und Einstellungen. */
export async function getDisplayLevelState(): Promise<{ level: Affiliation[]; isAdmin: boolean }> {
  const { user, tenant } = await requireTenant();
  return { level: await getTenantDisplayLevel(tenant.id), isAdmin: isAdminRole(user.role) };
}
