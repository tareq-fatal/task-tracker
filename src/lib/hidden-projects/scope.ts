import { AsyncLocalStorage } from "async_hooks";
import { REVEAL_COOKIE, verifyRevealToken } from "./reveal-token";

/**
 * TOF-0966 — Entscheidet pro Abfrage: werden verborgene Projekte gefiltert?
 *
 * Standard: JA (fail-closed). Ausnahmen, in dieser Reihenfolge:
 *  1. Ein expliziter Scope via `withHiddenProjects()` — für System-Jobs
 *     (Crons, Mandanten-Löschung), die Verwaltungs-Actions des Admins und den
 *     MCP-Admin-Schalter `includeHidden`.
 *  2. Der Admin-Anzeigemodus im Browser: gültiges, sitzungsgebundenes Cookie.
 * Außerhalb eines Requests (Skripte, Worker) ohne Scope wird gefiltert.
 */

const SESSION_COOKIE = "tt_session"; // = lib/auth SESSION_COOKIE (auth.ts ist server-only + prisma → Zyklus)

const scope = new AsyncLocalStorage<{ reveal: boolean }>();

// Prisma-Abfragen sind „lazy“: sie laufen erst beim ersten `then`. Würde der
// Callback das Promise nur zurückgeben, liefe die Abfrage NACH dem Scope —
// deshalb wird hier IM Scope gewartet (Fund aus hidden.db.test.ts).
function runIn<T>(reveal: boolean, fn: () => PromiseLike<T> | T): Promise<T> {
  return scope.run({ reveal }, async () => await fn());
}

/** Führt `fn` mit sichtbaren verborgenen Projekten aus. */
export function withHiddenProjects<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return runIn(true, fn);
}

/** Erzwingt den Filter auch im Admin-Anzeigemodus (z. B. Benachrichtigungs-Prüfung). */
export function withoutHiddenProjects<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return runIn(false, fn);
}

function isNextDynamicBailout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    (err as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

/** Liest das Anzeigemodus-Cookie der laufenden Anfrage. */
async function revealCookieActive(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  try {
    const { cookies } = await import("next/headers");
    const jar = cookies();
    return verifyRevealToken(jar.get(REVEAL_COOKIE)?.value, secret, jar.get(SESSION_COOKIE)?.value);
  } catch (err) {
    // Statische Generierung muss Next weiterhin abbrechen dürfen.
    if (isNextDynamicBailout(err)) throw err;
    // Kein Request-Kontext (Skript, Cron ohne Scope, unstable_cache) → filtern.
    return false;
  }
}

export async function revealHiddenProjects(): Promise<boolean> {
  const explicit = scope.getStore();
  if (explicit) return explicit.reveal;
  return revealCookieActive();
}
