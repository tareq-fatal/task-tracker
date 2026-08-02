import { describe, it, expect } from "vitest";
import { formatDate, formatNumber, formatRelative } from "./format";

describe("formatRelative", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  it("DE relative hours", () => {
    expect(formatRelative(new Date("2026-08-02T10:00:00Z"), "de", now)).toBe("vor 2 Stunden");
  });
  it("TR relative minutes", () => {
    expect(formatRelative(new Date("2026-08-02T11:59:00Z"), "tr", now)).toBe("1 dakika önce");
  });
  it("falls back to the absolute date beyond ~30 days", () => {
    expect(formatRelative(new Date("2026-05-01T12:00:00Z"), "de", now)).toBe("01.05.2026");
  });
});

describe("formatDate", () => {
  const d = new Date("2026-06-28T10:00:00Z");
  it("uses DE dd.MM.yyyy", () => {
    expect(formatDate(d, "de")).toBe("28.06.2026");
  });
  it("uses EN M/D/YYYY", () => {
    expect(formatDate(d, "en")).toBe("06/28/2026");
  });
  it("accepts ISO strings", () => {
    expect(formatDate("2026-06-28T10:00:00Z", "de")).toBe("28.06.2026");
  });
});

describe("formatNumber", () => {
  it("DE groups with dot, decimal comma", () => {
    expect(formatNumber(1234.56, "de")).toBe("1.234,56");
  });
  it("EN groups with comma, decimal dot", () => {
    expect(formatNumber(1234.56, "en")).toBe("1,234.56");
  });
  it("rounds to max 2 fraction digits by default", () => {
    expect(formatNumber(1000, "de")).toBe("1.000");
  });
});
