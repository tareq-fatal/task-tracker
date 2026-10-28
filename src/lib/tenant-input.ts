// Validation for the "new Mandant" wizard (createTenantAction) — pure, no DB,
// so it is unit-testable (tenant-input.test.ts).
//
// TOF-0783 (Tarek 28.10.2026): the owner (first TenantAdmin) is OPTIONAL.
// All owner* fields empty → only the tenant is created and the Superuser
// switches into it to set it up (projects, users via invite link). As soon as
// ANY owner field is filled, the previous rules apply unchanged.

export const TENANT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const USERNAME_RE = /^[a-z0-9._-]{3,}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const TENANT_OWNER_MIN_PASSWORD = 6;

export type TenantInput = {
  name: string;
  slug: string;
  primaryColor?: string;
  ownerName?: string;
  ownerUsername?: string;
  ownerEmail?: string;
  ownerPassword?: string;
};

export type TenantOwner = { name: string; username: string; email: string; password: string };

export type TenantInputError =
  | "EMPTY"
  | "BAD_SLUG"
  | "BAD_USERNAME"
  | "BAD_EMAIL"
  | "WEAK_PASSWORD";

export type ParsedTenantInput =
  | { ok: true; name: string; slug: string; primaryColor: string; owner: TenantOwner | null }
  | { ok: false; error: TenantInputError };

/** True when the wizard's owner section was left completely empty. */
export function ownerOmitted(input: TenantInput): boolean {
  return (
    !(input.ownerName ?? "").trim() &&
    !(input.ownerUsername ?? "").trim() &&
    !(input.ownerEmail ?? "").trim() &&
    !(input.ownerPassword ?? "")
  );
}

/**
 * Normalise + validate the wizard input. Error codes and their order are the
 * same as before TOF-0783 (EMPTY → BAD_SLUG → BAD_USERNAME → BAD_EMAIL →
 * WEAK_PASSWORD), so the UI messages keep working.
 */
export function parseTenantInput(input: TenantInput): ParsedTenantInput {
  const name = (input.name ?? "").trim();
  const slug = (input.slug ?? "").trim().toLowerCase();
  const primaryColor = input.primaryColor || "#4f46e5";

  if (ownerOmitted(input)) {
    if (!name) return { ok: false, error: "EMPTY" };
    if (!TENANT_SLUG_RE.test(slug)) return { ok: false, error: "BAD_SLUG" };
    return { ok: true, name, slug, primaryColor, owner: null };
  }

  const ownerName = (input.ownerName ?? "").trim();
  const ownerUsername = (input.ownerUsername ?? "").trim().toLowerCase();
  const ownerEmail = (input.ownerEmail ?? "").trim().toLowerCase();
  const ownerPassword = input.ownerPassword ?? "";

  if (!name || !ownerName) return { ok: false, error: "EMPTY" };
  if (!TENANT_SLUG_RE.test(slug)) return { ok: false, error: "BAD_SLUG" };
  if (!USERNAME_RE.test(ownerUsername)) return { ok: false, error: "BAD_USERNAME" };
  if (!EMAIL_RE.test(ownerEmail)) return { ok: false, error: "BAD_EMAIL" };
  if (ownerPassword.length < TENANT_OWNER_MIN_PASSWORD) return { ok: false, error: "WEAK_PASSWORD" };

  return {
    ok: true,
    name,
    slug,
    primaryColor,
    owner: { name: ownerName, username: ownerUsername, email: ownerEmail, password: ownerPassword },
  };
}
