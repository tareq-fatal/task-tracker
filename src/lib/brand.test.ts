import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyBrandToDictionaries, applyBrandToSeo } from "./brand";

// TOF-0791 (Tarek 30.10.2026): Instanz-Name „Objektus“ über NEXT_PUBLIC_APP_NAME.
describe("TOF-0791: Instanz-Name", () => {
  it("ohne Namen bleibt alles unverändert", () => {
    const d = { de: { "app.name": "Task Tracker", x: "y" }, ar: { "app.name": "متعقب المهام", x: "y" } };
    expect(applyBrandToDictionaries(structuredClone(d), null)).toEqual(d);
    const s = { de: { appName: "Task Tracker", title: "Task Tracker — Team", description: "Task Tracker ist …" } };
    expect(applyBrandToSeo(structuredClone(s), null)).toEqual(s);
  });
  it("mit Namen heißt die App in jeder Sprache so, auch Titel und Beschreibung", () => {
    const d = applyBrandToDictionaries({ de: { "app.name": "Task Tracker" }, ar: { "app.name": "متعقب المهام" } }, "Objektus");
    expect(d.de["app.name"]).toBe("Objektus");
    expect(d.ar["app.name"]).toBe("Objektus");
    const s = applyBrandToSeo({ de: { appName: "Task Tracker", title: "Task Tracker — Team", description: "Task Tracker ist schlank" } }, "Objektus");
    expect(s.de).toEqual({ appName: "Objektus", title: "Objektus — Team", description: "Objektus ist schlank" });
  });
  it("i18n, SEO und Dockerfile sind verdrahtet", () => {
    expect(readFileSync("src/lib/i18n.ts", "utf8")).toMatch(/applyBrandToDictionaries\(dictionaries, BRAND_NAME\)/);
    expect(readFileSync("src/lib/seo.ts", "utf8")).toMatch(/applyBrandToSeo\(/);
    expect(readFileSync("Dockerfile", "utf8")).toMatch(/ARG NEXT_PUBLIC_APP_NAME=""/);
  });
});
