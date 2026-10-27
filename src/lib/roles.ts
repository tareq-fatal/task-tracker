// Single source of truth for the role/capability model. Unit-tested.
//
//   Superuser   — Tarek (stored as "BackendAdmin", legacy "SuperAdmin"). Spans ALL tenants, DB console, onboarding.
//   Admin       — TenantAdmin (customer). Full control of their OWN tenant only.
//   User        — member. Works on their tasks; no admin surfaces.
import type { Role } from "./enums";

export type Capability =
  | "manageTenants" // create tenants + onboarding wizard (Superuser only)
  | "switchTenant" // /t/{slug} (Superuser only)
  | "useDbConsole" // /admin/db (Superuser only)
  | "manageUsers" // invite/DELETE users, assign roles within the tenant
  | "manageUsersBasic" // edit regular users (name/email/phone/locale), deactivate, pw-reset
  | "manageTeams"
  | "manageProjects"
  | "manageWorkflow" // columns, custom fields, automation, templates
  | "viewReports"
  | "editTenantSettings" // name/logo/colour of the own tenant
  // Kundenwunsch 2026-08-02: ALL content deletion (tasks, subtasks, comments,
  // attachments, voice notes, time entries, task links, bulk delete) is
  // admin-only — no "own content" exception. Personal-inbox cleanup (own bell
  // notifications, own saved views, own push subscription) is NOT content
  // deletion and stays open to every role.
  | "deleteContent";

const TENANT_ADMIN: Capability[] = [
  "manageUsers",
  "manageUsersBasic",
  "manageTeams",
  "manageProjects",
  "manageWorkflow",
  "viewReports",
  "editTenantSettings",
  "deleteContent",
];

const MATRIX: Record<Role, Capability[]> = {
  // BackendAdmin (shown as "Superuser") gets everything (tenant-admin caps + the Superuser-only ones)
  BackendAdmin: [...TENANT_ADMIN, "manageTenants", "switchTenant", "useDbConsole"],
  Admin: TENANT_ADMIN,
  // SubAdmin: helps run the tenant — edits REGULAR users + reads reports, but
  // no deletes, no role changes, no tenant settings, no backend surfaces.
  SubAdmin: ["manageUsersBasic", "viewReports"],
  User: [],
};

/** Normalize the legacy "SuperAdmin" value to the new "BackendAdmin". */
function norm(role: string): Role {
  if (role === "SuperAdmin" || role === "BackendAdmin") return "BackendAdmin";
  if (role === "Admin") return "Admin";
  if (role === "SubAdmin") return "SubAdmin";
  return "User";
}

export function can(role: string, cap: Capability): boolean {
  return MATRIX[norm(role)].includes(cap);
}

/** i18n key for a role's display label. */
export function roleLabelKey(
  role: string
): "role.backend" | "role.admin" | "role.subadmin" | "role.user" {
  const r = norm(role);
  if (r === "BackendAdmin") return "role.backend";
  if (r === "Admin") return "role.admin";
  if (r === "SubAdmin") return "role.subadmin";
  return "role.user";
}

/**
 * May `actorRole` edit a user with `targetRole` (basic fields, deactivate,
 * password reset)? Backend admins may touch anyone but other backend admins
 * are off-limits to tenant admins; SubAdmins may ONLY touch regular users —
 * never admins, other sub-admins, or themselves-by-role-peers.
 */
export function canEditUserTarget(actorRole: string, targetRole: string): boolean {
  const a = norm(actorRole);
  const t = norm(targetRole);
  if (a === "BackendAdmin") return true;
  if (a === "Admin") return t !== "BackendAdmin";
  if (a === "SubAdmin") return t === "User";
  return false;
}

/** Roles the actor may assign when creating users or changing roles.
 *  SubAdmins assign nothing (role management is admin-only). */
export function assignableRoles(actorRole: string): Role[] {
  const a = norm(actorRole);
  if (a === "BackendAdmin") return ["Admin", "SubAdmin", "User"];
  if (a === "Admin") return ["SubAdmin", "User"];
  return [];
}
