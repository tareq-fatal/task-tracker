import { describe, expect, it } from "vitest";
import { checkStatusChange } from "./task-workflow-policy";

const base = {
  isAdmin: false,
  from: "Todo",
  to: "InProgress",
  allowedTargetColumn: null as string | null,
  requireAllTodosDone: false,
  openTodos: 0,
  requireTimeTracking: false,
  loggedMinutes: 0,
};

describe("checkStatusChange — Feature 1 (Ziel-Spalte)", () => {
  it("locks non-admins to the allowed target column", () => {
    expect(checkStatusChange({ ...base, allowedTargetColumn: "InProgress", to: "InProgress" })).toEqual({ ok: true });
    expect(checkStatusChange({ ...base, allowedTargetColumn: "InProgress", to: "Done" })).toEqual({ ok: false, error: "TARGET_LOCKED" });
    expect(checkStatusChange({ ...base, allowedTargetColumn: "InProgress", to: "Todo", from: "InProgress" })).toEqual({ ok: false, error: "TARGET_LOCKED" });
  });

  it("user CANNOT close unless the admin picked Done as the target", () => {
    expect(checkStatusChange({ ...base, allowedTargetColumn: "InProgress", from: "InProgress", to: "Done" })).toEqual({ ok: false, error: "TARGET_LOCKED" });
    expect(checkStatusChange({ ...base, allowedTargetColumn: "Done", from: "InProgress", to: "Done" })).toEqual({ ok: true });
  });

  it("admin bypasses everything (A1)", () => {
    expect(checkStatusChange({ ...base, isAdmin: true, allowedTargetColumn: "InProgress", to: "Done", requireAllTodosDone: true, openTodos: 5, requireTimeTracking: true })).toEqual({ ok: true });
  });

  it("no metadata → behaves like before (A3)", () => {
    expect(checkStatusChange({ ...base, to: "Done" })).toEqual({ ok: true });
  });

  it("same status is always a no-op", () => {
    expect(checkStatusChange({ ...base, allowedTargetColumn: "Done", from: "Todo", to: "Todo" })).toEqual({ ok: true });
  });
});

describe("checkStatusChange — Feature 2 (Todos) + Feature 3 (Zeit)", () => {
  it("blocks Done while todos are open", () => {
    expect(checkStatusChange({ ...base, to: "Done", requireAllTodosDone: true, openTodos: 2 })).toEqual({ ok: false, error: "TODOS_OPEN" });
    expect(checkStatusChange({ ...base, to: "Done", requireAllTodosDone: true, openTodos: 0 })).toEqual({ ok: true });
  });

  it("blocks Done without logged time", () => {
    expect(checkStatusChange({ ...base, to: "Done", requireTimeTracking: true, loggedMinutes: 0 })).toEqual({ ok: false, error: "TIME_REQUIRED" });
    expect(checkStatusChange({ ...base, to: "Done", requireTimeTracking: true, loggedMinutes: 120 })).toEqual({ ok: true });
  });

  it("gates only apply to Done, not to other moves", () => {
    expect(checkStatusChange({ ...base, to: "InProgress", requireAllTodosDone: true, openTodos: 3, requireTimeTracking: true })).toEqual({ ok: true });
  });

  it("todos gate wins over time gate (deterministic order)", () => {
    expect(checkStatusChange({ ...base, to: "Done", requireAllTodosDone: true, openTodos: 1, requireTimeTracking: true, loggedMinutes: 0 })).toEqual({ ok: false, error: "TODOS_OPEN" });
  });
});
