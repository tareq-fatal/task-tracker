import { describe, it, expect } from "vitest";
import { can, roleLabelKey, type Capability } from "./roles";

describe("can — capability matrix", () => {
  it("BackendAdmin (+ legacy SuperAdmin) has the god-mode capabilities", () => {
    for (const c of ["manageTenants", "switchTenant", "useDbConsole"] as Capability[]) {
      expect(can("BackendAdmin", c)).toBe(true);
      expect(can("SuperAdmin", c)).toBe(true); // legacy value still works
    }
  });
  it("TenantAdmin manages its own tenant but NOT god-mode", () => {
    for (const c of ["manageUsers", "manageTeams", "manageProjects", "manageWorkflow", "editTenantSettings"] as Capability[]) {
      expect(can("Admin", c)).toBe(true);
    }
    for (const c of ["manageTenants", "switchTenant", "useDbConsole"] as Capability[]) {
      expect(can("Admin", c)).toBe(false);
    }
  });
  it("User has no admin capabilities", () => {
    for (const c of ["manageUsers", "manageProjects", "viewReports", "useDbConsole"] as Capability[]) {
      expect(can("User", c)).toBe(false);
    }
  });
  it("unknown role has nothing", () => {
    expect(can("Nonsense", "manageUsers")).toBe(false);
  });

  // Kundenwunsch 2026-08-02: ALL content deletion is admin-only.
  it("deleteContent belongs to Admin + BackendAdmin only", () => {
    expect(can("BackendAdmin", "deleteContent")).toBe(true);
    expect(can("SuperAdmin", "deleteContent")).toBe(true); // legacy value
    expect(can("Admin", "deleteContent")).toBe(true);
    expect(can("SubAdmin", "deleteContent")).toBe(false);
    expect(can("User", "deleteContent")).toBe(false);
  });
});

describe("roleLabelKey", () => {
  it("maps roles to i18n keys (legacy SuperAdmin → backend label)", () => {
    expect(roleLabelKey("BackendAdmin")).toBe("role.backend");
    expect(roleLabelKey("SuperAdmin")).toBe("role.backend");
    expect(roleLabelKey("Admin")).toBe("role.admin");
    expect(roleLabelKey("User")).toBe("role.user");
    expect(roleLabelKey("weird")).toBe("role.user");
  });
});
