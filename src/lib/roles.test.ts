import { describe, it, expect } from "vitest";
import { can, roleLabelKey, type Capability } from "./roles";

describe("can — capability matrix", () => {
  it("SuperAdmin has the god-mode capabilities", () => {
    for (const c of ["manageTenants", "switchTenant", "useDbConsole"] as Capability[]) {
      expect(can("SuperAdmin", c)).toBe(true);
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
});

describe("roleLabelKey", () => {
  it("maps roles to i18n keys", () => {
    expect(roleLabelKey("SuperAdmin")).toBe("role.super");
    expect(roleLabelKey("Admin")).toBe("role.admin");
    expect(roleLabelKey("User")).toBe("role.user");
    expect(roleLabelKey("weird")).toBe("role.user");
  });
});
