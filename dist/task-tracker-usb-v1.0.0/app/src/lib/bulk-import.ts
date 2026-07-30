// Generic admin bulk import (CSV / Excel) for Tasks, Users and Projects.
// Pure parsing + validation logic — no DB access here (unit-tested).
// The server actions in src/actions/bulk-import.ts provide the DB context
// (existing keys, lookup maps) and run the actual writes in one transaction.

import { read, utils, write, type WorkBook } from "xlsx";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskStatus,
  type TaskPriority,
  type TaskType,
  type Locale,
} from "./enums";

export const IMPORT_ENTITIES = ["tasks", "users", "projects"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export function isImportEntity(v: string | null | undefined): v is ImportEntity {
  return !!v && (IMPORT_ENTITIES as readonly string[]).includes(v);
}

/** Hard cap — keeps one upload inside the server-action body limit + txn timeout. */
export const MAX_IMPORT_ROWS = 5000;

/* ------------------------------------------------------------------ */
/* Column specs (canonical header + accepted aliases in en/de/ar)      */
/* ------------------------------------------------------------------ */

type ColumnSpec = {
  key: string;
  header: string; // canonical header used in the downloadable template
  required: boolean;
  aliases: string[]; // lowercased, matched against normalized sheet headers
};

const TASK_COLUMNS: ColumnSpec[] = [
  { key: "title", header: "Title", required: true, aliases: ["title", "titel", "aufgabe", "aufgabenname", "العنوان", "المهمة"] },
  { key: "description", header: "Description", required: false, aliases: ["description", "beschreibung", "notes", "notizen", "الوصف"] },
  { key: "status", header: "Status", required: false, aliases: ["status", "الحالة"] },
  { key: "priority", header: "Priority", required: false, aliases: ["priority", "priorität", "prioritaet", "الأولوية"] },
  { key: "type", header: "Type", required: false, aliases: ["type", "typ", "art", "النوع"] },
  { key: "project", header: "Project", required: false, aliases: ["project", "projekt", "المشروع"] },
  { key: "assignee", header: "Assignee", required: false, aliases: ["assignee", "assigned to", "zugewiesen an", "bearbeiter", "المسؤول", "المكلف"] },
  { key: "dueDate", header: "DueDate", required: false, aliases: ["duedate", "due date", "fälligkeitsdatum", "faelligkeitsdatum", "fällig am", "تاريخ الاستحقاق"] },
  { key: "storyPoints", header: "StoryPoints", required: false, aliases: ["storypoints", "story points", "punkte", "النقاط"] },
  { key: "estimatedHours", header: "EstimatedHours", required: false, aliases: ["estimatedhours", "estimated hours", "aufwand", "aufwand (h)", "الساعات المقدرة"] },
];

const USER_COLUMNS: ColumnSpec[] = [
  { key: "name", header: "Name", required: true, aliases: ["name", "الاسم"] },
  { key: "username", header: "Username", required: true, aliases: ["username", "benutzername", "login", "اسم المستخدم"] },
  { key: "email", header: "Email", required: false, aliases: ["email", "e-mail", "mail", "البريد الإلكتروني", "البريد"] },
  { key: "role", header: "Role", required: false, aliases: ["role", "rolle", "الدور"] },
  { key: "locale", header: "Locale", required: false, aliases: ["locale", "sprache", "language", "اللغة"] },
  { key: "password", header: "Password", required: false, aliases: ["password", "passwort", "كلمة المرور"] },
];

const PROJECT_COLUMNS: ColumnSpec[] = [
  { key: "name", header: "Name", required: true, aliases: ["name", "projektname", "project name", "الاسم", "اسم المشروع"] },
  { key: "description", header: "Description", required: false, aliases: ["description", "beschreibung", "الوصف"] },
  { key: "color", header: "Color", required: false, aliases: ["color", "colour", "farbe", "اللون"] },
];

export const ENTITY_COLUMNS: Record<ImportEntity, ColumnSpec[]> = {
  tasks: TASK_COLUMNS,
  users: USER_COLUMNS,
  projects: PROJECT_COLUMNS,
};

/* ------------------------------------------------------------------ */
/* Value parsing helpers                                               */
/* ------------------------------------------------------------------ */

const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();

/** Header normalization: lowercase, collapse whitespace. */
function normHeader(h: unknown): string {
  return lower(h).replace(/\s+/g, " ");
}

const STATUS_SYNONYMS: Record<string, TaskStatus> = {
  todo: "Todo", offen: "Todo", open: "Todo", neu: "Todo", "to do": "Todo",
  "جديد": "Todo", "للتنفيذ": "Todo",
  inprogress: "InProgress", "in progress": "InProgress", "in bearbeitung": "InProgress", laufend: "InProgress",
  "قيد التنفيذ": "InProgress",
  done: "Done", erledigt: "Done", fertig: "Done", abgeschlossen: "Done",
  "منجز": "Done", "تم": "Done", "مكتمل": "Done",
  archived: "Archived", archiviert: "Archived", "مؤرشف": "Archived",
};

const PRIORITY_SYNONYMS: Record<string, TaskPriority> = {
  low: "Low", niedrig: "Low", "منخفضة": "Low", "منخفض": "Low",
  medium: "Medium", mittel: "Medium", normal: "Medium", "متوسطة": "Medium", "متوسط": "Medium",
  high: "High", hoch: "High", wichtig: "High", "عالية": "High", "عالي": "High",
  critical: "Critical", kritisch: "Critical", dringend: "Critical", "حرجة": "Critical", "عاجلة": "Critical",
};

const TYPE_SYNONYMS: Record<string, TaskType> = {
  epic: "Epic", story: "Story",
  task: "Task", aufgabe: "Task", "مهمة": "Task",
  subtask: "Subtask", unteraufgabe: "Subtask",
  bug: "Bug", fehler: "Bug", "خطأ": "Bug",
};

const ROLE_SYNONYMS: Record<string, "Admin" | "User"> = {
  admin: "Admin", administrator: "Admin", "مدير": "Admin",
  user: "User", benutzer: "User", mitarbeiter: "User", "مستخدم": "User",
};

const LOCALE_SYNONYMS: Record<string, Locale> = {
  ar: "ar", arabic: "ar", arabisch: "ar", "العربية": "ar",
  de: "de", german: "de", deutsch: "de", "الألمانية": "de",
  en: "en", english: "en", englisch: "en", "الإنجليزية": "en",
};

export function parseStatus(v: unknown): TaskStatus | undefined | null {
  const s = lower(v);
  if (!s) return undefined; // → default
  if ((TASK_STATUSES as readonly string[]).includes(norm(v))) return norm(v) as TaskStatus;
  return STATUS_SYNONYMS[s] ?? null; // null → invalid
}

export function parsePriority(v: unknown): TaskPriority | undefined | null {
  const s = lower(v);
  if (!s) return undefined;
  if ((TASK_PRIORITIES as readonly string[]).includes(norm(v))) return norm(v) as TaskPriority;
  return PRIORITY_SYNONYMS[s] ?? null;
}

export function parseType(v: unknown): TaskType | undefined | null {
  const s = lower(v);
  if (!s) return undefined;
  if ((TASK_TYPES as readonly string[]).includes(norm(v))) return norm(v) as TaskType;
  return TYPE_SYNONYMS[s] ?? null;
}

export function parseRole(v: unknown): "Admin" | "User" | undefined | null {
  const s = lower(v);
  if (!s) return undefined;
  return ROLE_SYNONYMS[s] ?? null;
}

export function parseLocale(v: unknown): Locale | undefined | null {
  const s = lower(v);
  if (!s) return undefined;
  return LOCALE_SYNONYMS[s] ?? null;
}

/**
 * Import date cell → Date. Accepts Date (cellDates), Excel serial numbers,
 * ISO "YYYY-MM-DD", German "DD.MM.YYYY" and "DD/MM/YYYY".
 * undefined = empty, null = present but unparseable.
 */
export function parseImportDate(v: unknown): Date | undefined | null {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = norm(v);
  if (!s) return undefined;
  const dm = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dm) {
    const d = new Date(Date.UTC(+dm[3], +dm[2] - 1, +dm[1]));
    return d.getUTCMonth() === +dm[2] - 1 && d.getUTCDate() === +dm[1] ? d : null;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return d.getUTCMonth() === +iso[2] - 1 && d.getUTCDate() === +iso[3] ? d : null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Number cell → number (accepts "2,5" German decimals). undefined = empty, null = invalid. */
export function parseImportNumber(v: unknown): number | undefined | null {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = norm(v).replace(",", ".");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* File parsing                                                        */
/* ------------------------------------------------------------------ */

export type RawRow = { sheetRow: number; values: Record<string, unknown> };

export type ParsedFile = {
  ok: boolean;
  error?: "EMPTY" | "MISSING_COLUMNS" | "TOO_MANY_ROWS";
  missingColumns?: string[]; // canonical headers that were required but absent
  rows: RawRow[];
};

/**
 * Parse an uploaded .xlsx / .csv buffer into raw rows keyed by column spec key.
 * Uses the first sheet. Header matching is case-insensitive via aliases.
 */
export function parseImportFile(buffer: Buffer, entity: ImportEntity): ParsedFile {
  const wb = read(buffer, { type: "buffer", cellDates: true, codepage: 65001 });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) return { ok: false, error: "EMPTY", rows: [] };

  const grid = utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  if (grid.length < 2) return { ok: false, error: "EMPTY", rows: [] };

  const specs = ENTITY_COLUMNS[entity];
  const headers = (grid[0] ?? []).map(normHeader);

  // spec key → column index (first alias hit wins)
  const colIndex = new Map<string, number>();
  for (const spec of specs) {
    const wanted = new Set([normHeader(spec.header), ...spec.aliases.map(normHeader)]);
    const idx = headers.findIndex((h) => wanted.has(h));
    if (idx >= 0) colIndex.set(spec.key, idx);
  }

  const missing = specs.filter((s) => s.required && !colIndex.has(s.key)).map((s) => s.header);
  if (missing.length > 0) {
    return { ok: false, error: "MISSING_COLUMNS", missingColumns: missing, rows: [] };
  }

  const rows: RawRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const values: Record<string, unknown> = {};
    let hasAny = false;
    for (const spec of specs) {
      const idx = colIndex.get(spec.key);
      const v = idx != null ? line[idx] : undefined;
      values[spec.key] = v;
      if (v != null && norm(v) !== "") hasAny = true;
    }
    if (!hasAny) continue; // fully empty line
    rows.push({ sheetRow: i + 1, values }); // 1-based incl. header → matches Excel row nr
  }

  if (rows.length === 0) return { ok: false, error: "EMPTY", rows: [] };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "TOO_MANY_ROWS", rows: [] };
  return { ok: true, rows };
}

/* ------------------------------------------------------------------ */
/* Row validation                                                      */
/* ------------------------------------------------------------------ */

export type IssueCode =
  | "MISSING_REQUIRED"
  | "TOO_LONG"
  | "BAD_ENUM"
  | "BAD_DATE"
  | "BAD_NUMBER"
  | "BAD_EMAIL"
  | "BAD_USERNAME"
  | "BAD_COLOR"
  | "PASSWORD_TOO_SHORT"
  | "UNKNOWN_PROJECT"
  | "UNKNOWN_ASSIGNEE"
  | "DUPLICATE_IN_FILE"
  | "ALREADY_EXISTS";

export type RowIssue = { code: IssueCode; column?: string; value?: string };

export type RowStatusKind = "create" | "skip" | "error";

export type RowReport = {
  sheetRow: number;
  label: string; // title / name / username shown in the preview table
  status: RowStatusKind;
  issues: RowIssue[];
};

export type TaskPayload = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  projectId: string | null;
  assignedToUserId: string | null;
  dueDate: Date | null;
  storyPoints: number | null;
  estimatedHours: number | null;
};

export type UserPayload = {
  name: string;
  username: string; // lowercased
  email: string | null; // lowercased
  role: "Admin" | "User";
  locale: Locale | null; // null → Prisma default
  password: string | null; // null → generate temp password
};

export type ProjectPayload = {
  name: string;
  description: string | null;
  color: string;
};

export type ValidationCtx = {
  /** lowercased "title|projectNameLower" for existing tasks in the tenant */
  existingTaskKeys: Set<string>;
  /** lowercased project name → project id (tenant) */
  projectsByName: Map<string, string>;
  /** lowercased username/email → user id (tenant; usernames global) */
  usersByHandle: Map<string, string>;
  /** lowercased existing usernames (global) */
  existingUsernames: Set<string>;
  /** lowercased existing emails (tenant) */
  existingEmails: Set<string>;
  /** lowercased existing project names (tenant) */
  existingProjectNames: Set<string>;
};

export type ValidatedRows<P> = { reports: RowReport[]; payloads: (P | null)[] };

const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const TITLE_MAX = 500;
const DESC_MAX = 8000;
const NAME_MAX = 120;

export function validateTaskRows(rows: RawRow[], ctx: ValidationCtx): ValidatedRows<TaskPayload> {
  const reports: RowReport[] = [];
  const payloads: (TaskPayload | null)[] = [];
  const seenInFile = new Set<string>();

  for (const r of rows) {
    const issues: RowIssue[] = [];
    const v = r.values;

    const title = norm(v.title);
    if (!title) issues.push({ code: "MISSING_REQUIRED", column: "Title" });
    else if (title.length > TITLE_MAX) issues.push({ code: "TOO_LONG", column: "Title" });

    const description = norm(v.description) || null;
    if (description && description.length > DESC_MAX) issues.push({ code: "TOO_LONG", column: "Description" });

    const status = parseStatus(v.status);
    if (status === null) issues.push({ code: "BAD_ENUM", column: "Status", value: norm(v.status) });
    const priority = parsePriority(v.priority);
    if (priority === null) issues.push({ code: "BAD_ENUM", column: "Priority", value: norm(v.priority) });
    const type = parseType(v.type);
    if (type === null) issues.push({ code: "BAD_ENUM", column: "Type", value: norm(v.type) });

    const projectName = norm(v.project);
    let projectId: string | null = null;
    if (projectName) {
      const found = ctx.projectsByName.get(projectName.toLowerCase());
      if (!found) issues.push({ code: "UNKNOWN_PROJECT", column: "Project", value: projectName });
      else projectId = found;
    }

    const assignee = norm(v.assignee);
    let assignedToUserId: string | null = null;
    if (assignee) {
      const found = ctx.usersByHandle.get(assignee.toLowerCase());
      if (!found) issues.push({ code: "UNKNOWN_ASSIGNEE", column: "Assignee", value: assignee });
      else assignedToUserId = found;
    }

    const dueDate = parseImportDate(v.dueDate);
    if (dueDate === null) issues.push({ code: "BAD_DATE", column: "DueDate", value: norm(v.dueDate) });

    const storyPoints = parseImportNumber(v.storyPoints);
    if (storyPoints === null || (storyPoints != null && (!Number.isInteger(storyPoints) || storyPoints < 0 || storyPoints > 999))) {
      issues.push({ code: "BAD_NUMBER", column: "StoryPoints", value: norm(v.storyPoints) });
    }
    const estimatedHours = parseImportNumber(v.estimatedHours);
    if (estimatedHours === null || (estimatedHours != null && (estimatedHours < 0 || estimatedHours > 10000))) {
      issues.push({ code: "BAD_NUMBER", column: "EstimatedHours", value: norm(v.estimatedHours) });
    }

    const label = title || "—";
    if (issues.length > 0) {
      reports.push({ sheetRow: r.sheetRow, label, status: "error", issues });
      payloads.push(null);
      continue;
    }

    // Duplicates: same title + project (in the file or already in the DB) → skip
    const key = `${title.toLowerCase()}|${projectName.toLowerCase()}`;
    if (seenInFile.has(key)) {
      reports.push({ sheetRow: r.sheetRow, label, status: "skip", issues: [{ code: "DUPLICATE_IN_FILE" }] });
      payloads.push(null);
      continue;
    }
    seenInFile.add(key);
    if (ctx.existingTaskKeys.has(key)) {
      reports.push({ sheetRow: r.sheetRow, label, status: "skip", issues: [{ code: "ALREADY_EXISTS" }] });
      payloads.push(null);
      continue;
    }

    reports.push({ sheetRow: r.sheetRow, label, status: "create", issues: [] });
    payloads.push({
      title,
      description,
      status: status ?? "Todo",
      priority: priority ?? "Medium",
      type: type ?? "Task",
      projectId,
      assignedToUserId,
      dueDate: dueDate ?? null,
      storyPoints: storyPoints ?? null,
      estimatedHours: estimatedHours ?? null,
    });
  }

  return { reports, payloads };
}

export function validateUserRows(rows: RawRow[], ctx: ValidationCtx): ValidatedRows<UserPayload> {
  const reports: RowReport[] = [];
  const payloads: (UserPayload | null)[] = [];
  const seenUsernames = new Set<string>();
  const seenEmails = new Set<string>();

  for (const r of rows) {
    const issues: RowIssue[] = [];
    const v = r.values;

    const name = norm(v.name);
    if (!name) issues.push({ code: "MISSING_REQUIRED", column: "Name" });
    else if (name.length > NAME_MAX) issues.push({ code: "TOO_LONG", column: "Name" });

    const username = norm(v.username).toLowerCase();
    if (!username) issues.push({ code: "MISSING_REQUIRED", column: "Username" });
    else if (username.length < 3 || username.length > 40 || !USERNAME_RE.test(username)) {
      issues.push({ code: "BAD_USERNAME", column: "Username", value: username });
    }

    const emailRaw = norm(v.email);
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    if (email && !EMAIL_RE.test(email)) issues.push({ code: "BAD_EMAIL", column: "Email", value: emailRaw });

    const role = parseRole(v.role);
    if (role === null) issues.push({ code: "BAD_ENUM", column: "Role", value: norm(v.role) });

    const locale = parseLocale(v.locale);
    if (locale === null) issues.push({ code: "BAD_ENUM", column: "Locale", value: norm(v.locale) });

    const password = norm(v.password) || null;
    if (password && password.length < 6) issues.push({ code: "PASSWORD_TOO_SHORT", column: "Password" });

    const label = username || name || "—";
    if (issues.length > 0) {
      reports.push({ sheetRow: r.sheetRow, label, status: "error", issues });
      payloads.push(null);
      continue;
    }

    if (seenUsernames.has(username) || (email && seenEmails.has(email))) {
      reports.push({ sheetRow: r.sheetRow, label, status: "skip", issues: [{ code: "DUPLICATE_IN_FILE" }] });
      payloads.push(null);
      continue;
    }
    seenUsernames.add(username);
    if (email) seenEmails.add(email);

    if (ctx.existingUsernames.has(username) || (email && ctx.existingEmails.has(email))) {
      reports.push({ sheetRow: r.sheetRow, label, status: "skip", issues: [{ code: "ALREADY_EXISTS" }] });
      payloads.push(null);
      continue;
    }

    reports.push({ sheetRow: r.sheetRow, label, status: "create", issues: [] });
    payloads.push({
      name,
      username,
      email,
      role: role ?? "User",
      locale: locale ?? null,
      password,
    });
  }

  return { reports, payloads };
}

export function validateProjectRows(rows: RawRow[], ctx: ValidationCtx): ValidatedRows<ProjectPayload> {
  const reports: RowReport[] = [];
  const payloads: (ProjectPayload | null)[] = [];
  const seenNames = new Set<string>();

  for (const r of rows) {
    const issues: RowIssue[] = [];
    const v = r.values;

    const name = norm(v.name);
    if (!name) issues.push({ code: "MISSING_REQUIRED", column: "Name" });
    else if (name.length > NAME_MAX) issues.push({ code: "TOO_LONG", column: "Name" });

    const description = norm(v.description) || null;
    if (description && description.length > 2000) issues.push({ code: "TOO_LONG", column: "Description" });

    const colorRaw = norm(v.color);
    if (colorRaw && !COLOR_RE.test(colorRaw)) issues.push({ code: "BAD_COLOR", column: "Color", value: colorRaw });

    const label = name || "—";
    if (issues.length > 0) {
      reports.push({ sheetRow: r.sheetRow, label, status: "error", issues });
      payloads.push(null);
      continue;
    }

    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      reports.push({ sheetRow: r.sheetRow, label, status: "skip", issues: [{ code: "DUPLICATE_IN_FILE" }] });
      payloads.push(null);
      continue;
    }
    seenNames.add(key);
    if (ctx.existingProjectNames.has(key)) {
      reports.push({ sheetRow: r.sheetRow, label, status: "skip", issues: [{ code: "ALREADY_EXISTS" }] });
      payloads.push(null);
      continue;
    }

    reports.push({ sheetRow: r.sheetRow, label, status: "create", issues: [] });
    payloads.push({ name, description, color: colorRaw || "#6366f1" });
  }

  return { reports, payloads };
}

/* ------------------------------------------------------------------ */
/* Template generation                                                 */
/* ------------------------------------------------------------------ */

/** Allowed values shown on the template's second sheet. */
const TEMPLATE_HINTS: Record<ImportEntity, string[][]> = {
  tasks: [
    ["Column", "Required", "Allowed values / format"],
    ["Title", "yes", "max 500 chars"],
    ["Description", "no", "max 8000 chars"],
    ["Status", "no", TASK_STATUSES.join(" | ") + " (default Todo)"],
    ["Priority", "no", TASK_PRIORITIES.join(" | ") + " (default Medium)"],
    ["Type", "no", TASK_TYPES.join(" | ") + " (default Task)"],
    ["Project", "no", "existing project name (import projects first)"],
    ["Assignee", "no", "existing username or email"],
    ["DueDate", "no", "YYYY-MM-DD or DD.MM.YYYY"],
    ["StoryPoints", "no", "integer 0-999"],
    ["EstimatedHours", "no", "number, e.g. 2.5"],
  ],
  users: [
    ["Column", "Required", "Allowed values / format"],
    ["Name", "yes", "max 120 chars"],
    ["Username", "yes", "3-40 chars: letters, numbers, . _ - (globally unique)"],
    ["Email", "no", "unique within the organization"],
    ["Role", "no", "Admin | User (default User)"],
    ["Locale", "no", "ar | de | en"],
    ["Password", "no", "min 6 chars — empty = temporary password is generated"],
  ],
  projects: [
    ["Column", "Required", "Allowed values / format"],
    ["Name", "yes", "max 120 chars (unique within the organization)"],
    ["Description", "no", "max 2000 chars"],
    ["Color", "no", "hex, e.g. #6366f1"],
  ],
};

export function buildTemplateWorkbook(entity: ImportEntity): WorkBook {
  const wb = utils.book_new();
  const headers = ENTITY_COLUMNS[entity].map((c) => c.header);
  const dataSheet = utils.aoa_to_sheet([headers]);
  dataSheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  utils.book_append_sheet(wb, dataSheet, "Data");
  const hintSheet = utils.aoa_to_sheet(TEMPLATE_HINTS[entity]);
  hintSheet["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 60 }];
  utils.book_append_sheet(wb, hintSheet, "Hints");
  return wb;
}

export function buildTemplateXlsx(entity: ImportEntity): Buffer {
  return write(buildTemplateWorkbook(entity), { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildTemplateCsv(entity: ImportEntity): string {
  return ENTITY_COLUMNS[entity].map((c) => c.header).join(",") + "\r\n";
}
