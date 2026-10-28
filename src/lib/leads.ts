// Leads je Projekt (TOF-0782, Tarek 28.10.2026) — reine Validierung,
// Status- und Sortierlogik ohne DB, getestet in leads.test.ts und
// tenant-isolation.test.ts. Server-Actions: src/actions/leads.ts.

export const LEAD_STATUSES = ["New", "Contacted", "Offer", "Won", "Lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

/** Feldlängen — großzügig, aber begrenzt (Formular + Server). */
export const LEAD_LIMITS = {
  company: 160,
  contact: 160,
  channel: 80,
  referredBy: 160,
  nextAction: 200,
  notes: 4000,
} as const;

/** Status-Chip-Farben (Tailwind), hell + dunkel. */
export const LEAD_STATUS_CHIP: Record<LeadStatus, string> = {
  New: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  Contacted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  Offer: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  Won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Lost: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
};

export type LeadInput = {
  company: string;
  contact: string | null;
  channel: string | null;
  referredBy: string | null;
  commissionPct: number | null;
  status: LeadStatus;
  nextAction: string | null;
  nextActionAt: Date | null;
  notes: string | null;
};

export type LeadInputError = "COMPANY_REQUIRED" | "BAD_STATUS" | "BAD_DATE" | "TOO_LONG" | "BAD_PERCENT";

/**
 * Provision in Prozent (TOF-0786): leer = keine; „20“, „12,5“, „12.5 %“ → Zahl
 * mit höchstens 2 Nachkommastellen, nur 0–100. Sonst null + Fehler.
 */
export function parseCommissionPct(v: unknown): { ok: true; value: number | null } | { ok: false } {
  const s = typeof v === "string" ? v.trim().replace(/\s*%$/, "").replace(",", ".") : "";
  if (!s) return { ok: true, value: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!(n >= 0 && n <= 100)) return { ok: false };
  return { ok: true, value: n };
}

const opt = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/**
 * Formularwerte → gespeicherte Werte. Datum als "yyyy-MM-dd" (input type=date)
 * oder ISO; leer = keins. Leerer Status = "New".
 */
export function parseLeadInput(raw: {
  company?: unknown;
  contact?: unknown;
  channel?: unknown;
  referredBy?: unknown;
  commissionPct?: unknown;
  status?: unknown;
  nextAction?: unknown;
  nextActionAt?: unknown;
  notes?: unknown;
}): { ok: true; value: LeadInput } | { ok: false; error: LeadInputError } {
  const company = opt(raw.company);
  if (!company) return { ok: false, error: "COMPANY_REQUIRED" };
  const statusRaw = opt(raw.status) ?? "New";
  if (!isLeadStatus(statusRaw)) return { ok: false, error: "BAD_STATUS" };
  const pct = parseCommissionPct(raw.commissionPct);
  if (!pct.ok) return { ok: false, error: "BAD_PERCENT" };

  const value: LeadInput = {
    company,
    contact: opt(raw.contact),
    channel: opt(raw.channel),
    referredBy: opt(raw.referredBy),
    commissionPct: pct.value,
    status: statusRaw,
    nextAction: opt(raw.nextAction),
    nextActionAt: null,
    notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.replace(/\r\n/g, "\n").trim() : null,
  };

  for (const k of Object.keys(LEAD_LIMITS) as (keyof typeof LEAD_LIMITS)[]) {
    const v = value[k];
    if (v && v.length > LEAD_LIMITS[k]) return { ok: false, error: "TOO_LONG" };
  }

  const dateRaw = opt(raw.nextActionAt);
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) return { ok: false, error: "BAD_DATE" };
    const d = new Date(dateRaw);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "BAD_DATE" };
    value.nextActionAt = d;
  }
  return { ok: true, value };
}

type Sortable = { nextActionAt: Date | null; company: string };

/** Nach nächster Aktion aufsteigend; Leads ohne Datum zuletzt, dann nach Firma. */
export function compareLeadsByNextAction(a: Sortable, b: Sortable): number {
  const ta = a.nextActionAt?.getTime();
  const tb = b.nextActionAt?.getTime();
  if (ta != null && tb != null && ta !== tb) return ta - tb;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;
  return a.company.localeCompare(b.company);
}

export function sortLeads<T extends Sortable>(leads: T[]): T[] {
  return [...leads].sort(compareLeadsByNextAction);
}

/** Filter aus der URL: ?status=Won&archived=1 */
export function parseLeadFilter(sp: { status?: string | string[]; archived?: string | string[] }): {
  status: LeadStatus | null;
  showArchived: boolean;
} {
  const s = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const a = Array.isArray(sp.archived) ? sp.archived[0] : sp.archived;
  return { status: isLeadStatus(s) ? s : null, showArchived: a === "1" };
}

export type LeadRef = { id: string; tenantId: string; projectId: string; archivedAt: Date | null };
export type TaskScope = { tenantId: string; projectId: string | null };

/**
 * Passt dieser Lead zu dieser Aufgabe? Nur wenn Mandant UND Projekt gleich
 * sind — ein Lead aus einem fremden Mandanten oder einem anderen Projekt wird
 * nie verknüpft (tenant-isolation.test.ts).
 */
export function leadMatchesTask(lead: LeadRef | null | undefined, task: TaskScope): boolean {
  if (!lead || !task.projectId) return false;
  return lead.tenantId === task.tenantId && lead.projectId === task.projectId;
}

/**
 * Darf die Aufgabe (neu) mit diesem Lead verknüpft werden? Wie
 * leadMatchesTask; ein archivierter Lead nur dann, wenn er schon vorher
 * verknüpft war (eine Bearbeitung soll den Bezug nicht stillschweigend lösen).
 */
export function acceptLeadLink(
  lead: LeadRef | null | undefined,
  task: TaskScope,
  currentLeadId: string | null = null
): boolean {
  if (!leadMatchesTask(lead, task)) return false;
  if (lead!.archivedAt && lead!.id !== currentLeadId) return false;
  return true;
}
