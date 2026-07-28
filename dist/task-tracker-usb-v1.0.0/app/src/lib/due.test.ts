import { describe, it, expect } from "vitest";
import { dueBucket } from "./due";

const now = new Date("2026-07-02T12:00:00");

describe("dueBucket", () => {
  it("null/invalid → null", () => {
    expect(dueBucket(null, now)).toBeNull();
    expect(dueBucket("not-a-date", now)).toBeNull();
  });
  it("past date → overdue", () => {
    expect(dueBucket("2026-07-01", now)).toBe("overdue");
  });
  it("same day → today (ignores time of day)", () => {
    expect(dueBucket("2026-07-02T23:00:00", now)).toBe("today");
  });
  it("within a week → week", () => {
    expect(dueBucket("2026-07-05", now)).toBe("week");
    expect(dueBucket("2026-07-09", now)).toBe("week"); // +7 days
  });
  it("beyond a week → far", () => {
    expect(dueBucket("2026-07-10", now)).toBe("far"); // +8 days
  });
});
