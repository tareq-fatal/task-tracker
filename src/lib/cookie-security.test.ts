import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cookieSecure } from "./cookie-security";

// TOF-0794 (Tarek 31.10.2026): COOKIE_SECURE für on-prem-LAN ohne TLS.
describe("TOF-0794: cookieSecure()", () => {
  it("ohne COOKIE_SECURE: bisheriges Verhalten (secure nur in production)", () => {
    expect(cookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "test" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "  " })).toBe(true);
  });
  it("COOKIE_SECURE=false schaltet secure auch in production ab", () => {
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "false" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "FALSE" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "0" })).toBe(false);
  });
  it("COOKIE_SECURE=true erzwingt secure auch außerhalb von production", () => {
    expect(cookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "true" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "true" })).toBe(true);
  });
  it("unbekannte Werte fallen auf das bisherige Verhalten zurück", () => {
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "vielleicht" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "vielleicht" })).toBe(false);
  });

  it("alle Session-/SSO-Cookies nutzen cookieSecure(), kein hartes NODE_ENV-secure mehr", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(p);
      }
    };
    walk("src");
    const offenders = files.filter((f) =>
      /secure:\s*process\.env\.NODE_ENV/.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
    for (const f of [
      "src/lib/auth.ts",
      "src/app/api/auth/[provider]/callback/route.ts",
      "src/app/api/auth/[provider]/start/route.ts",
    ]) {
      expect(readFileSync(f, "utf8")).toMatch(/secure: cookieSecure\(\)/);
    }
  });
});
