import { describe, it, expect } from "vitest";
import { commentReadByAll } from "./tasks";

// #12 — read-receipt logic
describe("commentReadByAll", () => {
  const T = 1000; // comment created at t=1000

  it("is unread when nobody has read past the comment", () => {
    expect(commentReadByAll(T, ["a", "b"], { a: 500, b: 999 })).toBe(false);
  });

  it("is read when all intended readers read at/after the comment", () => {
    expect(commentReadByAll(T, ["a", "b"], { a: 1000, b: 1500 })).toBe(true);
  });

  it("is unread when one reader is missing entirely", () => {
    expect(commentReadByAll(T, ["a", "b"], { a: 1500 })).toBe(false);
  });

  it("is 'not read' (sent only) when there are no other readers", () => {
    expect(commentReadByAll(T, [], { a: 9999 })).toBe(false);
  });

  it("treats a read exactly at the comment time as read", () => {
    expect(commentReadByAll(T, ["a"], { a: T })).toBe(true);
  });
});
