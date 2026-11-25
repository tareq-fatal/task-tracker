import { createHmac, timingSafeEqual } from "crypto";

/**
 * TOF-0966 — Token für den Admin-Anzeigemodus „Verborgene anzeigen“.
 *
 * Format `v1.<expMs>.<sig>`, sig = HMAC-SHA256(secret, "<sessionToken>.<expMs>").
 * Gebunden an die Sitzung: ein kopiertes Cookie taugt in keiner anderen
 * Sitzung, Abmelden macht es wertlos. Läuft spätestens nach REVEAL_MAX_MS ab,
 * damit der Modus nie „aus Versehen an“ bleibt, wenn das Handy weitergegeben
 * wird. Pure + unit-getestet; das Setzen ist nur Admins erlaubt
 * (actions/hidden-projects.ts).
 */

export const REVEAL_COOKIE = "tt_reveal_hidden";
export const REVEAL_MAX_MS = 30 * 60 * 1000;

function sign(secret: string, sessionToken: string, exp: number): string {
  return createHmac("sha256", secret).update(`${sessionToken}.${exp}`).digest("base64url");
}

export function createRevealToken(
  secret: string,
  sessionToken: string,
  now: number = Date.now(),
  ttlMs: number = REVEAL_MAX_MS
): string {
  const exp = now + Math.min(Math.max(ttlMs, 0), REVEAL_MAX_MS);
  return `v1.${exp}.${sign(secret, sessionToken, exp)}`;
}

export function verifyRevealToken(
  token: string | undefined,
  secret: string | undefined,
  sessionToken: string | undefined,
  now: number = Date.now()
): boolean {
  if (!token || !secret || !sessionToken) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isSafeInteger(exp) || exp <= now || exp > now + REVEAL_MAX_MS) return false;
  const expected = Buffer.from(sign(secret, sessionToken, exp));
  const given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Ablaufzeitpunkt eines (gültigen) Tokens, für die Banner-Anzeige. */
export function revealTokenExpiry(token: string | undefined): number | null {
  const exp = Number(token?.split(".")[1]);
  return Number.isSafeInteger(exp) ? exp : null;
}
