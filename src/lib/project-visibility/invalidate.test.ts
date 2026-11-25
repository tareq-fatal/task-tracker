import { describe, it, expect, vi } from "vitest";

// Regression (Live-Prüfung TOF-0967): Next.js lädt lib/prisma.ts in Produktion
// je Bundle-Schicht als eigene Instanz. Eine Änderung aus einer Server-Action
// muss die Guard-Caches ALLER Instanzen leeren, sonst zeigt das Rendering den
// alten Stand. Kein DB-Zugriff nötig: PrismaClient verbindet erst bei Abfragen.

describe("invalidateProjectVisibility across module instances", () => {
  it("reaches every guard in the process, not just its own", async () => {
    const env = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production"); // wie in Prod: kein globaler Client-Singleton
    process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/none";
    const g = globalThis as unknown as { __ttVisibilityGuards?: Set<{ invalidate: () => void }> };
    g.__ttVisibilityGuards?.clear();

    vi.resetModules();
    const a = await import("../prisma");
    vi.resetModules();
    await import("../prisma"); // zweite Instanz (z. B. RSC-Schicht)

    const guards = [...(g.__ttVisibilityGuards ?? [])];
    expect(guards).toHaveLength(2);
    const spies = guards.map((x) => vi.spyOn(x, "invalidate"));
    a.invalidateProjectVisibility(); // ausgelöst in Instanz A (Server-Action)
    for (const s of spies) expect(s).toHaveBeenCalled();

    vi.unstubAllEnvs();
    expect(process.env.NODE_ENV).toBe(env);
  });
});
