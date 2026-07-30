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

  const INVOLVED_ONLY = {
    tenantId: T,
    OR: [
      { assignees: { some: { userId: "u1" } } },
      { assignedToUserId: "u1" },
      { createdByUserId: "u1" },
    ],
  };

  it("a non-admin sees ONLY tasks they're involved in (creator/primary/co-assignee)", () => {
    expect(taskVisibilityClause(user, T, [])).toEqual(INVOLVED_ONLY);
  });

  it("HARDENED: project membership grants NO task visibility anymore", () => {
    // Same clause with or without member projects — an uninvolved member sees
    // zero foreign tasks in a shared project ("er sieht nur seinen Kram").
    expect(taskVisibilityClause(user, T, ["p1", "p2"])).toEqual(INVOLVED_ONLY);
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
