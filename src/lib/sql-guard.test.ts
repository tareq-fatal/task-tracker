import { describe, it, expect } from "vitest";
import { classifyQuery, isAllowed } from "./sql-guard";

describe("classifyQuery", () => {
  it("marks SELECT/EXPLAIN/WITH (read) as readOnly", () => {
    expect(classifyQuery("SELECT * FROM \"Task\"").readOnly).toBe(true);
    expect(classifyQuery("explain select 1").readOnly).toBe(true);
    expect(classifyQuery('WITH x AS (SELECT 1) SELECT * FROM x').readOnly).toBe(true);
  });
  it("flags mutating/DDL as dangerous + not readOnly", () => {
    for (const sql of ["DELETE FROM \"Task\"", "drop table x", "UPDATE \"Task\" SET x=1", "TRUNCATE \"Task\"", "INSERT INTO x VALUES (1)"]) {
      const c = classifyQuery(sql);
      expect(c.dangerous).toBe(true);
      expect(c.readOnly).toBe(false);
    }
  });
  it("catches a mutating CTE hidden behind WITH", () => {
    const c = classifyQuery("WITH d AS (DELETE FROM \"Task\" RETURNING *) SELECT * FROM d");
    expect(c.dangerous).toBe(true);
    expect(c.readOnly).toBe(false);
  });
  it("detects stacked statements", () => {
    expect(classifyQuery("SELECT 1; DROP TABLE x").multiStatement).toBe(true);
    expect(classifyQuery("SELECT 1;").multiStatement).toBe(false); // trailing ; ok
  });
  it("ignores comments when finding the first word", () => {
    expect(classifyQuery("-- a comment\nSELECT 1").firstWord).toBe("SELECT");
  });
});

describe("isAllowed", () => {
  it("read queries always allowed; writes need write-mode; multi blocked", () => {
    expect(isAllowed(classifyQuery("SELECT 1"), false).ok).toBe(true);
    expect(isAllowed(classifyQuery("DELETE FROM x"), false)).toEqual({ ok: false, reason: "WRITE_MODE_REQUIRED" });
    expect(isAllowed(classifyQuery("DELETE FROM x"), true).ok).toBe(true);
    expect(isAllowed(classifyQuery("SELECT 1; SELECT 2"), true)).toEqual({ ok: false, reason: "MULTI_STATEMENT" });
    expect(isAllowed(classifyQuery("   "), false)).toEqual({ ok: false, reason: "EMPTY" });
  });
});
