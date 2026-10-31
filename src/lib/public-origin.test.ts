import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { publicOrigin } from "./public-origin";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

// TOF-0794 (Test 31.10.2026): Weiterleitungen hinter Caddy nie auf 0.0.0.0:3000.
describe("TOF-0794: publicOrigin", () => {
  it("nimmt Host + Proto vom Proxy statt der internen Adresse", () => {
    expect(publicOrigin(req("https://0.0.0.0:3000/logout", { host: "tracker.marine.local", "x-forwarded-proto": "https" }))).toBe("https://tracker.marine.local");
    expect(publicOrigin(req("http://0.0.0.0:3000/logout", { host: "192.168.1.10:8080", "x-forwarded-proto": "http" }))).toBe("http://192.168.1.10:8080");
    expect(publicOrigin(req("https://0.0.0.0:3000/x", { "x-forwarded-host": "tasks.objektus.app", host: "app:3000", "x-forwarded-proto": "https" }))).toBe("https://tasks.objektus.app");
  });
  it("ohne/mit unbrauchbarem Host: bisheriges Verhalten (req.url)", () => {
    expect(publicOrigin(req("https://tasks.coastshield.net/logout"))).toBe("https://tasks.coastshield.net");
    expect(publicOrigin(req("https://tasks.coastshield.net/logout", { host: "evil.example/../x" }))).toBe("https://tasks.coastshield.net");
    expect(publicOrigin(req("https://tasks.coastshield.net/logout", { host: "0.0.0.0:3000" }))).toBe("https://tasks.coastshield.net");
  });
  it("unbekanntes Proto vom Proxy wird ignoriert", () => {
    expect(publicOrigin(req("https://0.0.0.0:3000/", { host: "a.local", "x-forwarded-proto": "javascript" }))).toBe("https://a.local");
  });
  it("kein Route-Handler baut Weiterleitungen mehr direkt aus req.url", () => {
    for (const f of ["src/app/logout/route.ts", "src/app/t/[slug]/route.ts", "src/app/api/auth/[provider]/callback/route.ts", "src/app/api/auth/[provider]/start/route.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/new URL\([^)]*,\s*req\.url\s*\)/);
      expect(s, f).toMatch(/publicOrigin\(req\)/);
    }
  });
});
