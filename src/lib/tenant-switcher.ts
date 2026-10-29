// Mandanten-Umschalter (TOF-0788, Tarek 29.10.2026): reine Entscheidung, wer
// den Umschalter als Auswahl sieht — getestet in tenant-switcher.test.ts.
// Doppelt verriegelt: das (app)-Layout lädt die Mandantenliste nur für den
// Superuser, und die Komponente öffnet die Auswahl zusätzlich nur, wenn die
// Rolle Superuser ist. Alle anderen sehen nur den Namen ihres Mandanten.
import { isSuperAdmin } from "./enums";

export type TenantSwitcherMode = "dropdown" | "static";

export function tenantSwitcherMode(role: string, tenantCount: number): TenantSwitcherMode {
  return isSuperAdmin(role) && tenantCount > 1 ? "dropdown" : "static";
}

/** Ziel des Eintrags „Alle Mandanten – Übersicht“ (nur Superuser). */
export const TENANT_OVERVIEW_HREF = "/admin/mandanten";
