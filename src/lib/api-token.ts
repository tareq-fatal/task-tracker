// Machine-token primitives for the MCP endpoint (POST /api/mcp).
//
// Deliberately dependency-light and free of `server-only`/prisma imports so the
// whole thing is unit-testable and reusable from scripts (scripts/mcp-token.mjs
// mints tokens through the same rules the API verifies them with).

import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Every raw token starts with this, so a leaked string is identifiable. */
export const TOKEN_PREFIX = "tt_mcp_";
/** Bytes of entropy in a token — 32 B = 256 bit, same class as Session.token. */
const TOKEN_BYTES = 32;
/** Characters of the raw token kept in the DB for display ("tt_mcp_1a2b3c4d"). */
const DISPLAY_CHARS = TOKEN_PREFIX.length + 8;

// "kontext" und "kommentar" (Tarek 15.10.2026) sind bewusst ENG: ein Kontext-Token liest nur
// /api/kontext.md und /api/projekte/<id>/kontext.md (Kontext + Aufgabenliste), ein Kommentar-Token
// schreibt nur Kommentare an Aufgaben. Keiner von beiden öffnet das MCP (dort zählt nur read/write).
export const API_SCOPES = ["read", "write", "kontext", "kommentar"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(v: string): v is ApiScope {
  return (API_SCOPES as readonly string[]).includes(v);
}

/** SHA-256 hex of a raw token. The DB only ever stores this. */
export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type MintedToken = {
  /** Shown to the operator exactly once — never stored. */
  raw: string;
  /** Goes into ApiToken.tokenHash. */
  tokenHash: string;
  /** Goes into ApiToken.prefix (display only, not a secret). */
  prefix: string;
};

/** Create a fresh token. `raw` is unrecoverable once it leaves this function. */
export function mintApiToken(): MintedToken {
  const raw = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("hex");
  return { raw, tokenHash: hashApiToken(raw), prefix: raw.slice(0, DISPLAY_CHARS) };
}

/**
 * Pull the raw token out of an Authorization header.
 * Accepts `Bearer <token>` (case-insensitive scheme) and nothing else — no
 * query-parameter fallback, which would leak the token into access logs.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = m?.[1];
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  return token;
}

/** Parse the stored CSV into a scope set, dropping anything unrecognised. */
export function parseScopes(csv: string | null | undefined): Set<ApiScope> {
  const out = new Set<ApiScope>();
  for (const part of (csv ?? "").split(",")) {
    const s = part.trim().toLowerCase();
    if (isApiScope(s)) out.add(s);
  }
  return out;
}

/** Serialize a scope list for storage, deduped and in a stable order. */
export function serializeScopes(scopes: readonly string[]): string {
  const set = new Set(scopes.map((s) => s.trim().toLowerCase()).filter(isApiScope));
  return API_SCOPES.filter((s) => set.has(s)).join(",");
}

/**
 * "write" implies "read" — a token that may change tasks may obviously see
 * them, and requiring both in the CSV would be a footgun at mint time.
 */
/** Darf ein Token eine MCP-Operation mit diesem Scope sehen? Kontext-/Kommentar-Tokens sehen keine. */
export function opSichtbar(scopes: Set<ApiScope>, opScope: ApiScope): boolean {
  return opScope === "write" ? scopes.has("write") : hasScope(scopes, "read");
}

export function hasScope(scopes: Set<ApiScope>, needed: ApiScope): boolean {
  if (scopes.has(needed)) return true;
  return needed === "read" && scopes.has("write");
}

export type TokenLifecycle = {
  revokedAt?: Date | null;
  expiresAt?: Date | null;
};

/** A token works only while it is neither revoked nor past its expiry. */
export function isTokenUsable(t: TokenLifecycle, now: Date = new Date()): boolean {
  if (t.revokedAt) return false;
  if (t.expiresAt && t.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Constant-time comparison of two hex hashes. The lookup itself is by unique
 * index (already constant-ish), but the final confirmation should not leak
 * position information through an early-exit `===`.
 */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
