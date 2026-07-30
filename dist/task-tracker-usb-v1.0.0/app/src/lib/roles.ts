// Single source of truth for the role/capability model. Unit-tested.
//
//   SuperAdmin  — Tarek. Spans ALL tenants, DB console, onboarding, god-mode.
//   Admin       — TenantAdmin (customer). Full control of their OWN tenant only.
//   User        — member. Works on their tasks; no admin surfaces.
import type { Role } from "./enums";

export type Capability =
  | "manageTenants" // create tenants + onboarding wizard (SuperAdmin only)
  | "switchTenant" // /t/{slug} (SuperAdmin only)
  | "useDbConsole" // /admin/db (SuperAdmin only)
  | "manageUsers" // invite/edit users within the tenant
  | "manageTeams"
  | "manageProjects"
  | "manageWorkflow" // columns, custom fields, automation, templates
  | "viewReports"
  | "editTenantSettings"; // name/logo/colour of the own tenant

const TENANT_ADMIN: Capability[] = [
  "manageUsers",
  "manageTeams",
  "manageProjects",
  "manageWorkflow",
  "viewReports",
  "editTenantSettings",
];

const MATRIX: Record<Role, Capability[]> = {
  // BackendAdmin gets everything (tenant-admin caps + the god-mode ones)
  BackendAdmin: [...TENANT_ADMIN, "manageTenants", "switchTenant", "useDbConsole"],
  Admin: TENANT_ADMIN,
  User: [],
};

/** Normalize the legacy "SuperAdmin" value to the new "BackendAdmin". */
function norm(role: string): Role {
  if (role === "SuperAdmin" || role === "BackendAdmin") return "BackendAdmin";
  if (role === "Admin") return "Admin";
  return "User";
}

export function can(role: string, cap: Capability): boolean {
  return MATRIX[norm(role)].includes(cap);
}

/** i18n key for a role's display label. */
export function roleLabelKey(role: string): "role.backend" | "role.admin" | "role.user" {
  const r = norm(role);
  if (r === "BackendAdmin") return "role.backend";
  if (r === "Admin") return "role.admin";
  return "role.user";
}
