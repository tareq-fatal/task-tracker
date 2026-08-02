import { describe, it, expect } from "vitest";
import { formatDate, formatNumber } from "./format";

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
