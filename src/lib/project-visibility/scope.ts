import { AsyncLocalStorage } from "async_hooks";
import { REVEAL_COOKIE, verifyRevealToken } from "./reveal-token";

/**
 * Entscheidet pro Abfrage, welche Sichtbarkeits-Achsen greifen.
 * Standard: BEIDE (fail-closed). Ausnahmen:
 *
 *  - `withAllProjects()` — System-Jobs (Crons, Löschvorschau), interne
 *    Prüfungen und die ausdrückliche Admin-Anfrage per MCP `includeHidden`:
 *    ignoriert Verborgen UND Anzeige-Ebene.
 *  - `withHiddenProjects()` — nur Verborgen aufgehoben.
 *  - Admin-Anzeigemodus im Browser (sitzungsgebundenes Cookie): hebt NUR
 *    „Verborgen“ auf. Die Anzeige-Ebene hat ihren eigenen Schalter
 *    („Zurück auf Alle“) und wird hier bewusst nicht umgangen.
 * Außerhalb eines Requests ohne Scope wird voll gefiltert.
 */

export type VisibilityScope = { revealHidden: boolean; ignoreLevel: boolean };

const SESSION_COOKIE = "tt_session"; // = lib/auth SESSION_COOKIE (auth.ts ist server-only + prisma → Zyklus)

const store = new AsyncLocalStorage<Partial<VisibilityScope>>();

// Prisma-Abfragen sind „lazy“: sie laufen erst beim ersten `then`. Würde der
// Callback das Promise nur zurückgeben, liefe die Abfrage NACH dem Scope —
// deshalb wird hier IM Scope gewartet (Fund aus hidden.db.test.ts).
function runIn<T>(s: Partial<VisibilityScope>, fn: () => PromiseLike<T> | T): Promise<T> {
  return store.run(s, async () => await fn());
}

/** Alles sichtbar: System-Jobs, interne Prüfungen, explizite Admin-Anfragen. */
export function withAllProjects<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return runIn({ revealHidden: true, ignoreLevel: true }, fn);
}

/** Nur verborgene Projekte sichtbar; die Anzeige-Ebene gilt weiter. */
export function withHiddenProjects<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return runIn({ revealHidden: true, ignoreLevel: false }, fn);
}

/** Erzwingt beide Achsen, auch im Admin-Anzeigemodus. */
export function withFullConcealment<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return runIn({ revealHidden: false, ignoreLevel: false }, fn);
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

export async function currentVisibilityScope(): Promise<VisibilityScope> {
  const explicit = store.getStore();
  return {
    revealHidden: explicit?.revealHidden ?? (await revealCookieActive()),
    ignoreLevel: explicit?.ignoreLevel ?? false,
  };
}

/** Kompatibel zu TOF-0966: ist „Verborgen“ gerade aufgehoben? */
export async function revealHiddenProjects(): Promise<boolean> {
  return (await currentVisibilityScope()).revealHidden;
}
