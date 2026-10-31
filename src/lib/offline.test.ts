import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { OPENAPI_SPEC_PATH, isOfflineMode } from "./offline";

// TOF-0794 (Tarek 31.10.2026): /api-docs ohne Swagger-CDN im Offline-Betrieb.
describe("TOF-0794: Offline-Modus /api-docs", () => {
  it("TT_OFFLINE schaltet den Offline-Modus, sonst bleibt alles wie bisher", () => {
    expect(isOfflineMode({})).toBe(false);
    expect(isOfflineMode({ TT_OFFLINE: "" })).toBe(false);
    expect(isOfflineMode({ TT_OFFLINE: "0" })).toBe(false);
    expect(isOfflineMode({ TT_OFFLINE: "false" })).toBe(false);
    expect(isOfflineMode({ TT_OFFLINE: "1" })).toBe(true);
    expect(isOfflineMode({ TT_OFFLINE: "true" })).toBe(true);
    expect(isOfflineMode({ TT_OFFLINE: " TRUE " })).toBe(true);
  });

  it("die Spezifikation liegt lokal unter /api/openapi.json", () => {
    expect(OPENAPI_SPEC_PATH).toBe("/api/openapi.json");
    expect(readFileSync("src/app/api/openapi.json/route.ts", "utf8")).toMatch(/export function GET/);
  });

  it("die Seite entscheidet zur Laufzeit und lädt offline nichts von außen", () => {
    const page = readFileSync("src/app/api-docs/page.tsx", "utf8");
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
    expect(page).toMatch(/if \(isOfflineMode\(\)\)/);
    expect(page).toMatch(/OPENAPI_SPEC_PATH/);
    // Der Offline-Zweig selbst enthält keine externe URL — unpkg lebt nur im Client-Teil.
    expect(page).not.toMatch(/https?:\/\//);
    expect(readFileSync("src/app/api-docs/swagger-ui.tsx", "utf8")).toMatch(/unpkg\.com/);
  });
});
