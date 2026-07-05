import { describe, it, expect } from "vitest";
import { receiptState, expectedReaders } from "./comment-receipts";

// #12 — per-comment read-receipt logic
describe("receiptState", () => {
  it("is 'sent' when no expected reader has read it", () => {
    expect(receiptState(["a", "b"], [])).toBe("sent");
    expect(receiptState(["a", "b"], ["c"])).toBe("sent"); // c isn't expected
  });

  it("is 'some' when at least one but not all expected readers have read", () => {
    expect(receiptState(["a", "b"], ["a"])).toBe("some");
  });

  it("is 'all' when every expected reader has read", () => {
    expect(receiptState(["a", "b"], ["a", "b"])).toBe("all");
    expect(receiptState(["a", "b"], ["a", "b", "c"])).toBe("all"); // extras ok
  });

  it("dedups expected readers so duplicates don't skew the count", () => {
    expect(receiptState(["a", "a", "b"], ["a", "b"])).toBe("all");
    expect(receiptState(["a", "a"], ["a"])).toBe("all");
  });

  it("with no expected audience, is 'sent' until anyone reads, then 'all'", () => {
    expect(receiptState([], [])).toBe("sent");
    expect(receiptState([], ["x"])).toBe("all");
  });

  it("accepts a Set of readers", () => {
    expect(receiptState(["a", "b"], new Set(["a"]))).toBe("some");
  });
});

describe("expectedReaders", () => {
  it("unions mentions and assignees and drops the author", () => {
    expect(
      expectedReaders("me", ["alice", "me"], ["bob", "me"]).sort()
    ).toEqual(["alice", "bob"]);
  });

  it("dedups across mentions and assignees", () => {
    expect(expectedReaders("me", ["alice"], ["alice", "bob"]).sort()).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("returns empty when the author is the only candidate", () => {
    expect(expectedReaders("me", ["me"], ["me"])).toEqual([]);
  });
});
