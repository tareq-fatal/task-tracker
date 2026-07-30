import { describe, it, expect } from "vitest";
import { taskVisibilityClause, canEditTaskContent } from "./task-access";

const admin = { id: "a1", role: "Admin" };
const backend = { id: "b1", role: "BackendAdmin" };
const legacy = { id: "s1", role: "SuperAdmin" };
const user = { id: "u1", role: "User" };
const T = "tenant-1";

describe("taskVisibilityClause (#26 project membership)", () => {
  it("admins see the whole tenant (no user/project scoping)", () => {
    expect(taskVisibilityClause(admin, T, [])).toEqual({ tenantId: T });
    expect(taskVisibilityClause(admin, T, ["p1"])).toEqual({ tenantId: T });
    // legacy + renamed backend roles both count as admin
    expect(taskVisibilityClause(backend, T, [])).toEqual({ tenantId: T });
    expect(taskVisibilityClause(legacy, T, [])).toEqual({ tenantId: T });
  });

  it("a non-admin with NO member projects sees tasks they're an assignee of", () => {
    expect(taskVisibilityClause(user, T, [])).toEqual({
      tenantId: T,
      assignees: { some: { userId: "u1" } },
    });
  });

  it("a member sees their assigned tasks OR any task in their member projects", () => {
    expect(taskVisibilityClause(user, T, ["p1", "p2"])).toEqual({
      tenantId: T,
      OR: [
        { assignees: { some: { userId: "u1" } } },
        { projectId: { in: ["p1", "p2"] } },
      ],
    });
  });

  it("always pins the tenant — never leaks across tenants", () => {
    for (const clause of [
      taskVisibilityClause(user, T, []),
      taskVisibilityClause(user, T, ["p1"]),
      taskVisibilityClause(admin, T, ["p1"]),
    ]) {
      expect(clause.tenantId).toBe(T);
    }
  });
});

describe("canEditTaskContent (#36 assigned-task edit lock)", () => {
  const ownTask = { createdByUserId: "u1" };
  const adminTask = { createdByUserId: "admin-x" };

  it("the creator may edit their own task's content", () => {
    expect(canEditTaskContent(user, ownTask)).toBe(true);
  });

  it("a non-creator (only assigned) may NOT edit content", () => {
    expect(canEditTaskContent(user, adminTask)).toBe(false);
  });

  it("admins/backend may edit any task's content", () => {
    expect(canEditTaskContent(admin, adminTask)).toBe(true);
    expect(canEditTaskContent(backend, adminTask)).toBe(true);
    expect(canEditTaskContent(legacy, adminTask)).toBe(true);
  });
});
