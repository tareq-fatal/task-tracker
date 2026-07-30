import { read, utils } from "xlsx";
import type { TaskStatus, TaskPriority } from "./enums";

/* ------------------------------------------------------------------ */
/* Pure mappers (unit-tested)                                          */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.trim().toLowerCase();

/** MS Planner bucket name → our task status (Tarek's mapping). */
export const BUCKET_STATUS: Record<string, TaskStatus> = {
  backlog: "Todo",
  "on hold": "Todo",
  "in planung": "Todo",
  "in klärung beim besteller": "Todo",
  "in bearbeitung": "InProgress",
  "test & qs": "InProgress",
  "in prüfung beim besteller": "InProgress",
  dokumentation: "InProgress",
  schulung: "InProgress",
  überarbeitung: "InProgress",
  "ready zum golive": "InProgress",
  erledigt: "Done",
  wiederkehrend: "Archived",
};

export function bucketToStatus(bucketName: string | undefined | null): TaskStatus {
  if (!bucketName) return "Todo";
  return BUCKET_STATUS[norm(bucketName)] ?? "Todo";
}

/**
 * Resolve final status: bucket mapping wins, but a "completed" Planner status
 * forces Done (unless the bucket is the recurring/Archived bucket).
 */
export function resolveStatus(
  bucketName: string | undefined | null,
  plannerStatus: string | undefined | null
): TaskStatus {
  const fromBucket = bucketToStatus(bucketName);
  if (fromBucket === "Archived") return "Archived";
  if (plannerStatus && norm(plannerStatus) === "abgeschlossen") return "Done";
  return fromBucket;
}

/** MS Planner priority (German) → our priority. */
export function plannerPriority(p: string | undefined | null): TaskPriority {
  switch (norm(p ?? "")) {
    case "dringend":
      return "Critical";
    case "wichtig":
      return "High";
    case "mittel":
      return "Medium";
    case "niedrig":
      return "Low";
    default:
      return "Medium";
  }
}

/** Parse a "2/12" checklist ratio → done/total/progress%. */
export function parseChecklist(
  value: string | undefined | null
): { done: number; total: number; progress: number } {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { done: 0, total: 0, progress: 0 };
  const done = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (total <= 0) return { done: 0, total: 0, progress: 0 };
  return { done, total, progress: Math.round((done / total) * 100) };
}

/** Parse a Planner date cell ("YYYY-MM-DD" string or Excel serial) → Date|null. */
export function parsePlannerDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* Workbook parsing                                                    */
/* ------------------------------------------------------------------ */

export type ParsedUser = { plannerId: string; name: string; email: string };

export type ParsedTask = {
  externalId: string;
  title: string;
  bucket: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  assigneePlannerId: string | null;
  creatorPlannerId: string | null;
  createdAt: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  notes: string;
};

export type ParsedWorkbook = {
  planId: string;
  planName: string;
  users: ParsedUser[];
  tasks: ParsedTask[];
  bucketCount: number;
};

function headerIndex(headers: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set(String(h ?? "").trim().toLowerCase(), i));
  return map;
}

function rowsOf(wb: ReturnType<typeof read>, sheet: string): unknown[][] {
  const ws = wb.Sheets[sheet];
  if (!ws) return [];
  return utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
}

/** Parse the SAP-B1 / MS-Planner workbook into normalized records. */
export function parsePlannerWorkbook(buffer: Buffer): ParsedWorkbook {
  const wb = read(buffer, { type: "buffer", cellDates: true });

  // Plan
  const planRows = rowsOf(wb, "Plan");
  const planHdr = headerIndex(planRows[0] ?? []);
  const planRow = planRows[1] ?? [];
  const planId = String(planRow[planHdr.get("plan-id") ?? 0] ?? "").trim();
  const planName =
    String(planRow[planHdr.get("planname") ?? 1] ?? "").trim() || "Imported plan";

  // Buckets (id → name)
  const bucketRows = rowsOf(wb, "Buckets");
  const bHdr = headerIndex(bucketRows[0] ?? []);
  const bIdx = bHdr.get("bucket-id") ?? 0;
  const bNameIdx = bHdr.get("bucket-name") ?? 1;
  const buckets = new Map<string, string>();
  for (let i = 1; i < bucketRows.length; i++) {
    const id = String(bucketRows[i][bIdx] ?? "").trim();
    if (id) buckets.set(id, String(bucketRows[i][bNameIdx] ?? "").trim());
  }

  // Users
  const userRows = rowsOf(wb, "Benutzer");
  const uHdr = headerIndex(userRows[0] ?? []);
  const uId = uHdr.get("benutzer-id") ?? 0;
  const uName = uHdr.get("benutzername") ?? 1;
  const uMail = uHdr.get("e-mail") ?? 2;
  const users: ParsedUser[] = [];
  for (let i = 1; i < userRows.length; i++) {
    const plannerId = String(userRows[i][uId] ?? "").trim();
    const email = String(userRows[i][uMail] ?? "").trim();
    if (!plannerId || !email) continue;
    users.push({
      plannerId,
      name: String(userRows[i][uName] ?? "").trim() || email,
      email,
    });
  }

  // Tasks — prefer the "Aufgaben" sheet (machine ids); fallback to consolidated.
  const taskSheet = wb.Sheets["Aufgaben"] ? "Aufgaben" : "Konsolidierte Daten";
  const taskRows = rowsOf(wb, taskSheet);
  const h = headerIndex(taskRows[0] ?? []);
  const col = (name: string) => h.get(name) ?? -1;
  const get = (row: unknown[], name: string): string => {
    const i = col(name);
    return i >= 0 ? String(row[i] ?? "").trim() : "";
  };

  const tasks: ParsedTask[] = [];
  for (let i = 1; i < taskRows.length; i++) {
    const row = taskRows[i];
    const externalId = get(row, "vorgangsnummer");
    const title = get(row, "aufgabenname");
    if (!externalId && !title) continue;

    const bucketRef = get(row, "eimer");
    const bucketName = buckets.get(bucketRef) ?? bucketRef; // id → name (or already a name)
    const plannerStatus = get(row, "status");
    const status = resolveStatus(bucketName, plannerStatus);
    const { progress } = parseChecklist(get(row, "abgeschlossene checklistenpunkte"));

    tasks.push({
      externalId: externalId || `${planId}-${i}`,
      title: title || "(ohne Titel)",
      bucket: bucketName,
      status,
      priority: plannerPriority(get(row, "priorität")),
      progress: status === "Done" ? 100 : progress,
      assigneePlannerId: get(row, "zugewiesen an") || null,
      creatorPlannerId: get(row, "erstellt von") || null,
      createdAt: parsePlannerDate(get(row, "erstellungsdatum")),
      dueDate: parsePlannerDate(get(row, "fälligkeitsdatum")),
      completedAt:
        status === "Done" ? parsePlannerDate(get(row, "abgeschlossen am")) : null,
      notes: get(row, "notizen"),
    });
  }

  return {
    planId: planId || planName,
    planName,
    users,
    tasks,
    bucketCount: buckets.size,
  };
}
