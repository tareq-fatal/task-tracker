// BackendAdmin (Tarek) spans all tenants + DB console + tenant creation.
// "SuperAdmin" is the legacy name — still accepted everywhere so nothing breaks
// before/if the data migration renames a row.
export const ROLES = ["BackendAdmin", "Admin", "SubAdmin", "User"] as const;
export type Role = (typeof ROLES)[number];

const BACKEND = new Set(["BackendAdmin", "SuperAdmin"]);

export function isAdminRole(role: string): boolean {
  return role === "Admin" || BACKEND.has(role);
}
/** SubAdmin: helps run the tenant — edits regular users, READS everything,
 *  but no destructive/critical actions and no role management. */
export function isSubAdmin(role: string): boolean {
  return role === "SubAdmin";
}
/** Admin, BackendAdmin or SubAdmin — roles with tenant-wide READ access. */
export function isStaffRole(role: string): boolean {
  return isAdminRole(role) || isSubAdmin(role);
}
/** True for the backend/system admin (new "BackendAdmin" or legacy "SuperAdmin"). */
export function isSuperAdmin(role: string): boolean {
  return BACKEND.has(role);
}
/** Alias with the new name. */
export const isBackendAdmin = isSuperAdmin;

export const TASK_STATUSES = ["Todo", "InProgress", "Done", "Archived"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Statuses shown as Kanban columns (Archived is hidden from the board)
export const BOARD_STATUSES = ["Todo", "InProgress", "Done"] as const;

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * Dieselben vier Stufen, wie sie im Gespräch heißen: P1–P4 und die deutschen
 * Wörter. Gespeichert wird weiter der englische Wert — es gibt also keinen
 * zweiten Satz Prioritäten, nur einen zweiten Satz Namen dafür. Ohne das
 * stolpert jede Schnittstelle über ein „P1", das fachlich eindeutig ist.
 */
const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  p1: "Critical", p2: "High", p3: "Medium", p4: "Low",
  kritisch: "Critical", hoch: "High", mittel: "Medium", gering: "Low", niedrig: "Low",
};

/** Eingabe → gespeicherter Prioritätswert, oder null, wenn es keine Stufe ist. */
export function resolvePriority(v: string): TaskPriority | null {
  const raw = String(v ?? "").trim();
  const exact = (TASK_PRIORITIES as readonly string[]).find(
    (p) => p.toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact as TaskPriority;
  return PRIORITY_ALIASES[raw.toLowerCase()] ?? null;
}

/** P1–P4 als Kurzform, für Berichte und Schnittstellen-Antworten. */
export const PRIORITY_SHORT: Record<TaskPriority, string> = {
  Critical: "P1",
  High: "P2",
  Medium: "P3",
  Low: "P4",
};

// Issue hierarchy types (Epic > Story > Task > Subtask; Bug sits with Task).
export const TASK_TYPES = ["Epic", "Story", "Task", "Subtask", "Bug"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export function isTaskType(v: string): v is TaskType {
  return (TASK_TYPES as readonly string[]).includes(v);
}

export const TASK_LINK_TYPES = [
  "DependsOn",
  "Blocks",
  "RelatedTo",
  "SubtaskOf",
] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];

export function isTaskLinkType(v: string): v is TaskLinkType {
  return (TASK_LINK_TYPES as readonly string[]).includes(v);
}

// Arabic is the primary language (RTL); English and German follow.
export const LOCALES = ["ar", "en", "de", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

export function dirForLocale(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

export function isTaskPriority(v: string): v is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(v);
}

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
