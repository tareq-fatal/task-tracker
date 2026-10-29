import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tenantSwitcherMode } from "./tenant-switcher";

// TOF-0788 (Tarek 29.10.2026): normale Benutzer sehen den Mandanten-Umschalter nie.
describe("TOF-0788: Mandanten-Umschalter nur für den Superuser", () => {
  it("Superuser (BackendAdmin, alt SuperAdmin) bekommt die Auswahl", () => {
    expect(tenantSwitcherMode("BackendAdmin", 5)).toBe("dropdown");
    expect(tenantSwitcherMode("SuperAdmin", 2)).toBe("dropdown");
  });
  it("alle anderen Rollen sehen nur ihren Mandanten — auch wenn eine Liste ankäme", () => {
    for (const role of ["Admin", "SubAdmin", "User", "", "weird"]) {
      expect(tenantSwitcherMode(role, 5), role).toBe("static");
    }
  });
  it("mit nur einem Mandanten gibt es nichts zu wechseln", () => {
    expect(tenantSwitcherMode("BackendAdmin", 1)).toBe("static");
  });
  it("Layout lädt die Mandantenliste nur für den Superuser", () => {
    const src = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(src).toMatch(/const tenants = isSuperAdmin\(user\.role\) \? await listTenants\(\) : \[\];/);
  });
  it("die Komponente entscheidet über tenantSwitcherMode mit der Rolle", () => {
    const src = readFileSync("src/components/tenant-switcher.tsx", "utf8");
    expect(src).toMatch(/tenantSwitcherMode\(role, tenants\.length\)/);
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    const calls = shell.match(/<TenantSwitcher [^>]*\/>/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toContain("role={user.role}");
  });
});
