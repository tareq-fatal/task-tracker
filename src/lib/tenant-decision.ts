// Pure decision behind getActiveTenant (lib/tenant.ts) — no cookies, no DB, so
// the tenant lock is unit-tested (tenant-isolation.test.ts). TOF-0783 /
// TOF-0782 (Tarek 28.10.2026): only extracted, behaviour unchanged:
//   - Superuser ("BackendAdmin", legacy "SuperAdmin"): try the cookie-selected
//     slug; if it doesn't resolve, getActiveTenant falls back to the own tenant.
//   - Everyone else: HARD-LOCKED to the own tenant — the cookie is ignored.
import { isSuperAdmin } from "./enums";

/** Slug to look up first, or null = use the user's own tenant directly. */
export function tenantSlugToTry(
  user: { role: string },
  cookieSlug: string | null | undefined
): string | null {
  if (!isSuperAdmin(user.role)) return null;
  return cookieSlug ? cookieSlug : null;
}
