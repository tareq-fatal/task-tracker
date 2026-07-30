import { describe, it, expect } from "vitest";
import { parseCron, isValidCron, nextCronOccurrence } from "./cron";

describe("parseCron / isValidCron", () => {
  it("accepts a well-formed 5-field expression", () => {
    const c = parseCron("0 9 * * 1-5");
    expect([...c.minutes]).toEqual([0]);
    expect([...c.hours]).toEqual([9]);
    expect([...c.daysOfWeek]).toEqual([1, 2, 3, 4, 5]);
    expect(c.dowRestricted).toBe(true);
    expect(c.domRestricted).toBe(false);
  });

  it("expands lists, ranges and steps", () => {
    expect([...parseCron("0,30 * * * *").minutes]).toEqual([0, 30]);
    expect([...parseCron("*/15 * * * *").minutes]).toEqual([0, 15, 30, 45]);
    expect([...parseCron("0 9-11 * * *").hours]).toEqual([9, 10, 11]);
  });

  it("normalises Sunday-as-7 to 0", () => {
    expect([...parseCron("0 0 * * 7").daysOfWeek]).toEqual([0]);
  });

  it("rejects malformed expressions", () => {
    expect(isValidCron("0 9 * *")).toBe(false); // 4 fields
    expect(isValidCron("60 * * * *")).toBe(false); // minute out of range
    expect(isValidCron("0 9 * * 8")).toBe(false); // dow out of range
    expect(isValidCron("0 5-2 * * *")).toBe(false); // reversed range
    expect(isValidCron("")).toBe(false);
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
  });
});

describe("nextCronOccurrence", () => {
  it("finds the next daily time in UTC", () => {
    const from = new Date("2026-07-01T06:00:00Z");
    expect(nextCronOccurrence("0 9 * * *", from, "UTC")?.toISOString()).toBe(
      "2026-07-01T09:00:00.000Z"
    );
  });

  it("is strictly after `from` (skips the current matching minute)", () => {
    const from = new Date("2026-07-01T09:00:00Z");
    expect(nextCronOccurrence("0 9 * * *", from, "UTC")?.toISOString()).toBe(
      "2026-07-02T09:00:00.000Z"
    );
  });

  it("honours steps within the hour", () => {
    const from = new Date("2026-07-01T09:07:00Z");
    expect(nextCronOccurrence("*/15 9 * * *", from, "UTC")?.toISOString()).toBe(
      "2026-07-01T09:15:00.000Z"
    );
  });

  it("skips to the next weekday for a Mon-Fri schedule", () => {
    const sat = new Date("2026-07-04T12:00:00Z"); // Saturday
    expect(nextCronOccurrence("0 9 * * 1-5", sat, "UTC")?.toISOString()).toBe(
      "2026-07-06T09:00:00.000Z" // Monday
    );
  });

  it("anchors wall-clock to the timezone (summer, CEST = UTC+2)", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    // 09:00 Berlin in July is 07:00 UTC.
    expect(nextCronOccurrence("0 9 * * *", from, "Europe/Berlin")?.toISOString()).toBe(
      "2026-07-01T07:00:00.000Z"
    );
  });

  it("anchors wall-clock to the timezone (winter, CET = UTC+1)", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    // 09:00 Berlin in January is 08:00 UTC.
    expect(nextCronOccurrence("0 9 * * *", from, "Europe/Berlin")?.toISOString()).toBe(
      "2026-01-01T08:00:00.000Z"
    );
  });

  it("returns null for an invalid expression", () => {
    expect(nextCronOccurrence("nonsense", new Date("2026-07-01T00:00:00Z"))).toBeNull();
  });
});
