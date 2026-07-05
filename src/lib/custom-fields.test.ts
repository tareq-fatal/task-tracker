import { describe, it, expect } from "vitest";
import { validateValue, parseOptions, displayValue, isFieldType, sortKeyFor } from "./custom-fields";

describe("validateValue", () => {
  it("text: trims + caps length", () => {
    expect(validateValue("text", "  hi ")).toEqual({ ok: true, value: "hi" });
    expect(validateValue("text", "x".repeat(600)).value).toHaveLength(500);
  });
  it("number: only numeric, normalized", () => {
    expect(validateValue("number", "42")).toEqual({ ok: true, value: "42" });
    expect(validateValue("number", "3.50")).toEqual({ ok: true, value: "3.5" });
    expect(validateValue("number", "abc")).toEqual({ ok: false, error: "NOT_A_NUMBER" });
  });
  it("select: must be a known option", () => {
    expect(validateValue("select", "B", ["A", "B"])).toEqual({ ok: true, value: "B" });
    expect(validateValue("select", "Z", ["A", "B"])).toEqual({ ok: false, error: "NOT_AN_OPTION" });
  });
  it("date: ISO only", () => {
    expect(validateValue("date", "2026-06-30")).toEqual({ ok: true, value: "2026-06-30" });
    expect(validateValue("date", "30.06.2026")).toEqual({ ok: false, error: "BAD_DATE" });
  });
  it("checkbox: coerces to true/false", () => {
    expect(validateValue("checkbox", "true").value).toBe("true");
    expect(validateValue("checkbox", "0").value).toBe("false");
  });
  it("user: must be a known member id", () => {
    expect(validateValue("user", "u1", ["u1", "u2"])).toEqual({ ok: true, value: "u1" });
    expect(validateValue("user", "ghost", ["u1", "u2"])).toEqual({ ok: false, error: "NOT_A_USER" });
  });
  it("empty value clears regardless of type", () => {
    expect(validateValue("number", "")).toEqual({ ok: true, value: "" });
    expect(validateValue("select", "  ", ["A"])).toEqual({ ok: true, value: "" });
  });
});

describe("parseOptions", () => {
  it("parses a JSON array of strings; bad input → []", () => {
    expect(parseOptions('["a","b"]')).toEqual(["a", "b"]);
    expect(parseOptions("not json")).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
  });
});

describe("displayValue / isFieldType", () => {
  it("renders checkbox + empty", () => {
    expect(displayValue("checkbox", "true")).toBe("✓");
    expect(displayValue("text", "")).toBe("—");
  });
  it("resolves user id → name, falls back to id", () => {
    expect(displayValue("user", "u1", { u1: "Alice" })).toBe("Alice");
    expect(displayValue("user", "u9", { u1: "Alice" })).toBe("u9");
  });
  it("guards field type", () => {
    expect(isFieldType("select")).toBe(true);
    expect(isFieldType("user")).toBe(true);
    expect(isFieldType("bogus")).toBe(false);
  });
});

describe("sortKeyFor", () => {
  it("numbers + dates sort numerically", () => {
    expect(sortKeyFor("number", "10")).toBe(10);
    expect(sortKeyFor("date", "2026-01-01")).toBe(Date.parse("2026-01-01"));
  });
  it("empty sorts last: +Inf for numeric, high sentinel for strings", () => {
    expect(sortKeyFor("number", "")).toBe(Number.POSITIVE_INFINITY);
    expect(sortKeyFor("text", "")).toBe("￿");
  });
  it("user sorts by resolved name (lower-cased)", () => {
    expect(sortKeyFor("user", "u1", { u1: "Bob" })).toBe("bob");
  });
  it("checkbox: checked before unchecked ascending", () => {
    expect(sortKeyFor("checkbox", "true") < sortKeyFor("checkbox", "false")).toBe(true);
  });
});
