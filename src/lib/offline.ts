// TOF-0794 (Tarek 31.10.2026): On-Premise-Betrieb ohne Internet.
//
// TT_OFFLINE=1 (Runtime-Env, von deployment/task-tracker-usb/install.sh im
// Offline-Modus gesetzt) schaltet die einzige Stelle ab, an der die App OHNE
// konfigurierten Fremddienst etwas von außen nachlädt: Swagger-UI auf /api-docs
// (unpkg.com). Alle anderen Außenverbindungen laufen nur, wenn der jeweilige
// Dienst per Env konfiguriert ist — Übersicht: deployment/task-tracker-usb/docs/OFFLINE.md.

type Env = Record<string, string | undefined>;

/** Lokale OpenAPI-Spezifikation (src/app/api/openapi.json/route.ts). */
export const OPENAPI_SPEC_PATH = "/api/openapi.json";

export function isOfflineMode(env: Env = process.env): boolean {
  const v = (env.TT_OFFLINE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
