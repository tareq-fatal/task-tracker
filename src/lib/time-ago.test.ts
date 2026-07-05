import { describe, it, expect } from "vitest";
import { timeAgo } from "./time-ago";

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
  it("buckets sub-minute as 'now'", () => {
    expect(timeAgo(NOW - 30_000, NOW)).toEqual({ unit: "now" });
    expect(timeAgo(NOW, NOW)).toEqual({ unit: "now" });
  });

  it("buckets minutes and hours", () => {
    expect(timeAgo(NOW - 5 * MIN, NOW)).toEqual({ unit: "m", value: 5 });
    expect(timeAgo(NOW - 3 * HOUR, NOW)).toEqual({ unit: "h", value: 3 });
  });

  it("buckets days up to a week", () => {
    expect(timeAgo(NOW - 2 * DAY, NOW)).toEqual({ unit: "d", value: 2 });
    expect(timeAgo(NOW - 6 * DAY, NOW)).toEqual({ unit: "d", value: 6 });
  });

  it("falls back to an absolute date past a week", () => {
    const then = NOW - 10 * DAY;
    expect(timeAgo(then, NOW)).toEqual({ unit: "date", value: then });
  });

  it("never returns a negative age for clock skew", () => {
    expect(timeAgo(NOW + 5000, NOW)).toEqual({ unit: "now" });
  });
});
