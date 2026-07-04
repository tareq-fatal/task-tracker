import { isAdminRole } from "./enums";

/**
 * Prisma `where` scoping tasks to the active tenant AND (for non-admins) to the
 * user's own tasks. Tenant scoping is always applied — never leak across tenants.
 */
export function taskVisibility(
  user: { id: string; role: string },
  tenantId: string
) {
  if (isAdminRole(user.role)) return { tenantId };
  // Regular users see ONLY tasks assigned to them (their own creations are always
  // self-assigned, so nothing is lost). Admins see the whole tenant.
  return { tenantId, assignedToUserId: user.id };
}
