// TOF-0795 (Tarek 31.10.2026): EINE Stelle für die Adresse dieser Instanz.
//
// Vorrang (serverseitig, zur Laufzeit):
//   APP_URL (Runtime-Env)  >  NEXT_PUBLIC_APP_URL (Runtime-Env)  >  SITE_URL (Build)
// SITE_URL ist der beim `next build` eingesetzte Wert von NEXT_PUBLIC_APP_URL;
// ein Build ohne diesen Wert (die Live-Instanz) behält den bisherigen Standard.
// Ohne APP_URL/NEXT_PUBLIC_APP_URL ändert sich also nichts gegenüber vorher.
//
// Das On-Prem-Image wird immer mit NEXT_PUBLIC_APP_URL=https://task-tracker.local
// gebaut (make-bundle.sh): Next setzt den Wert beim Build als Literal ein, der
// Minifier faltet `"https://task-tracker.local" || "…"` zu dem neutralen Wert —
// der historische Standard steht dann nicht mehr im Image. Deshalb wird
// process.env.NEXT_PUBLIC_APP_URL hier WÖRTLICH gelesen (sonst kein Inlining).

export type Env = Record<string, string | undefined>;

/** Build-Zeit-Adresse (`||`, nicht `??`: ein leeres Build-Arg ergibt ""). */
export const SITE_URL: string = process.env.NEXT_PUBLIC_APP_URL || "https://tasks.coastshield.net";

/**
 * Nur für Builds OHNE NEXT_PUBLIC_APP_URL (die historische Live-Instanz): dort
 * bleiben fest eingebaute Texte wie bisher. Jedes On-Prem-Image hat den Wert.
 */
export const LEGACY_TELEGRAM_BOT: string | null = process.env.NEXT_PUBLIC_APP_URL ? null : "CoastShieldHelpBot";

function clean(u: string | undefined): string {
  return (u || "").trim().replace(/\/+$/, "");
}

/** Basisadresse ohne Schrägstrich am Ende: APP_URL > NEXT_PUBLIC_APP_URL > SITE_URL. */
export function instanceUrl(env: Env = process.env): string {
  return clean(env.APP_URL) || clean(env.NEXT_PUBLIC_APP_URL) || clean(SITE_URL);
}

/** Hostname der Instanz (für die Absenderadresse); "localhost", falls unlesbar. */
export function instanceHost(env: Env = process.env): string {
  try {
    return new URL(instanceUrl(env)).hostname || "localhost";
  } catch {
    return "localhost";
  }
}

/** Host[:Port] der Build-Adresse — für Client-Texte („… in Chrome öffnen“). */
export function siteHost(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "";
  }
}
