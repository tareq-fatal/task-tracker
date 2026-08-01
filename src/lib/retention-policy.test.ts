import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  clampRetentionDays,
  retentionCutoff,
} from "./retention-policy";

describe("clampRetentionDays", () => {
  it("keeps valid values", () => {
    expect(clampRetentionDays(30)).toBe(30);
    expect(clampRetentionDays(1)).toBe(1);
    expect(clampRetentionDays(3650)).toBe(3650);
  });

  it("falls back to the default for garbage", () => {
    expect(clampRetentionDays(null)).toBe(DEFAULT_RETENTION_DAYS);
    expect(clampRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(clampRetentionDays("abc")).toBe(DEFAULT_RETENTION_DAYS);
    expect(clampRetentionDays(NaN)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("clamps out-of-range values", () => {
    expect(clampRetentionDays(0)).toBe(MIN_RETENTION_DAYS);
    expect(clampRetentionDays(-5)).toBe(MIN_RETENTION_DAYS);
    expect(clampRetentionDays(999999)).toBe(MAX_RETENTION_DAYS);
  });

  it("truncates fractions", () => {
    expect(clampRetentionDays(30.9)).toBe(30);
  });
});

describe("retentionCutoff", () => {
  it("subtracts whole days from now", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    expect(retentionCutoff(30, now).toISOString()).toBe("2026-07-02T12:00:00.000Z");
    expect(retentionCutoff(1, now).toISOString()).toBe("2026-07-31T12:00:00.000Z");
  });

  it("clamps the day count too", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(retentionCutoff(0, now).toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });
});
