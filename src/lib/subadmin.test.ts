import { describe, expect, it } from "vitest";
import { can, canEditUserTarget, assignableRoles } from "./roles";

// The five CI scenarios from the SubAdmin order.
describe("SubAdmin role", () => {
  it("1) SubAdmin may edit regular users", () => {
    expect(can("SubAdmin", "manageUsersBasic")).toBe(true);
    expect(canEditUserTarget("SubAdmin", "User")).toBe(true);
  });

  it("2) SubAdmin may NOT touch admins/sub-admins or assign any role", () => {
    expect(canEditUserTarget("SubAdmin", "Admin")).toBe(false);
    expect(canEditUserTarget("SubAdmin", "SubAdmin")).toBe(false);
    expect(canEditUserTarget("SubAdmin", "BackendAdmin")).toBe(false);
    expect(assignableRoles("SubAdmin")).toEqual([]); // no promoting to Admin — or anything
  });

  it("3) SubAdmin has no backend surface (tenants/db/switcher)", () => {
    expect(can("SubAdmin", "manageTenants")).toBe(false);
    expect(can("SubAdmin", "useDbConsole")).toBe(false);
    expect(can("SubAdmin", "switchTenant")).toBe(false);
  });

  it("4) SubAdmin cannot delete projects (or manage them at all)", () => {
    expect(can("SubAdmin", "manageProjects")).toBe(false);
  });

  it("5) SubAdmin cannot edit tenant settings / feature flags", () => {
    expect(can("SubAdmin", "editTenantSettings")).toBe(false);
  });

  it("hierarchy: admins keep full user management, admins assign SubAdmin but not Admin", () => {
    expect(can("Admin", "manageUsersBasic")).toBe(true);
    expect(can("Admin", "manageUsers")).toBe(true);
    expect(assignableRoles("Admin")).toEqual(["SubAdmin", "User"]);
    expect(assignableRoles("BackendAdmin")).toEqual(["Admin", "SubAdmin", "User"]);
    expect(canEditUserTarget("Admin", "BackendAdmin")).toBe(false);
  });
});
