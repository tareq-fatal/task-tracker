// Einladungslink zum Passwort-Setzen (TOF-0783, Tarek 28.10.2026).
//
// Pure primitives — no prisma, no next/headers — so token handling and the
// validity rule are unit-tested (invite.test.ts, tenant-isolation.test.ts).
// Same posture as ApiToken (lib/api-token.ts): the raw token leaves the server
// exactly once (inside the link); the DB only ever stores its SHA-256 hash.

import { createHash, randomBytes } from "crypto";

/** 32 B = 256 bit entropy, base64url → 43 characters. */
export const INVITE_TOKEN_BYTES = 32;
/** A link is valid for 72 hours and can be redeemed once. */
export const INVITE_TTL_HOURS = 72;
/** Same minimum as userSchema / settingsSchema in lib/validation.ts. */
export const INVITE_MIN_PASSWORD = 6;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** SHA-256 hex of a raw token. Invite.tokenHash holds exactly this. */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Cheap shape check before touching the DB (random junk → no query). */
export function isPlausibleInviteToken(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && TOKEN_RE.test(raw);
}

export type MintedInvite = { raw: string; tokenHash: string; expiresAt: Date };

/** Fresh token + its hash + expiry. `raw` is unrecoverable once it leaves here. */
export function mintInviteToken(now: Date = new Date()): MintedInvite {
  const raw = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
  return {
    raw,
    tokenHash: hashInviteToken(raw),
    expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000),
  };
}

/**
 * Secret for the password hash of an invite-only account: random, never shown,
 * never stored in clear. Nobody can log in with it — the user sets a real
 * password through the invite link.
 */
export function unusablePasswordSecret(): string {
  return randomBytes(32).toString("hex");
}

export type InviteRow = {
  tenantId: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
};
export type InviteUser = { id: string; tenantId: string; deactivatedAt: Date | null };

/**
 * May this invite be redeemed now? Single rule for the page AND the action.
 * The invite must be unused, unexpired, and bound to exactly this user IN
 * exactly this user's tenant — a token minted in Mandant A never applies to a
 * user of Mandant B (tenant-isolation.test.ts). Deactivated users are out.
 * Callers show ONE neutral message for every `false` (no hint why).
 */
export function inviteUsable(
  invite: InviteRow | null | undefined,
  user: InviteUser | null | undefined,
  now: Date = new Date()
): boolean {
  if (!invite || !user) return false;
  if (invite.usedAt) return false;
  if (!(invite.expiresAt.getTime() > now.getTime())) return false;
  if (invite.userId !== user.id) return false;
  if (invite.tenantId !== user.tenantId) return false;
  if (user.deactivatedAt) return false;
  return true;
}

export type NewPasswordError = "TOO_SHORT" | "MISMATCH";

/** New password + repetition from the invite form. */
export function checkNewPassword(password: string, repeat: string): NewPasswordError | null {
  if ((password ?? "").length < INVITE_MIN_PASSWORD) return "TOO_SHORT";
  if (password !== repeat) return "MISMATCH";
  return null;
}

/** `${origin}/einladung/${token}` — origin without trailing slash. */
export function inviteUrl(origin: string, raw: string): string {
  return `${origin.replace(/\/+$/, "")}/einladung/${raw}`;
}

type HeaderBag = { get(name: string): string | null };
const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:]+\](:\d{1,5})?$/;

/**
 * Origin of the current request as the admin sees it (behind Caddy: the
 * X-Forwarded-* headers it sets, see next.config.mjs). Anything that does not
 * look like a plain host falls back to `fallback` (APP_URL / SITE_URL).
 */
export function originFromHeaders(h: HeaderBag, fallback: string): string {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!host || !HOST_RE.test(host)) return fallback.replace(/\/+$/, "");
  const fwdProto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = fwdProto === "http" || fwdProto === "https" ? fwdProto : local ? "http" : "https";
  return `${proto}://${host}`;
}
