export const ROLES = ["Admin", "User"] as const;
export type Role = (typeof ROLES)[number];

export const TASK_STATUSES = ["Todo", "InProgress", "Done", "Archived"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Statuses shown as Kanban columns (Archived is hidden from the board)
export const BOARD_STATUSES = ["Todo", "InProgress", "Done"] as const;

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Arabic is the primary language (RTL); English and German follow.
export const LOCALES = ["ar", "en", "de"] as const;
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
