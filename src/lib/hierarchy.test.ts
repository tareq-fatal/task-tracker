import { describe, it, expect } from "vitest";
import { parentTypeAllowed, rollup, wouldCreateCycle } from "./hierarchy";

describe("parentTypeAllowed", () => {
  it("allows higher-level parents", () => {
    expect(parentTypeAllowed("Story", "Epic")).toBe(true);
    expect(parentTypeAllowed("Task", "Story")).toBe(true);
    expect(parentTypeAllowed("Subtask", "Task")).toBe(true);
    expect(parentTypeAllowed("Subtask", "Bug")).toBe(true);
  });
  it("rejects same/lower-level parents", () => {
    expect(parentTypeAllowed("Epic", "Story")).toBe(false);
    expect(parentTypeAllowed("Task", "Task")).toBe(false);
    expect(parentTypeAllowed("Story", "Task")).toBe(false);
  });
});

describe("rollup", () => {
  it("counts done/total and progress by count when no points", () => {
    const r = rollup([
      { status: "Done", progress: 100 },
      { status: "Todo", progress: 0 },
      { status: "InProgress", progress: 50 },
      { status: "Done", progress: 100 },
    ]);
    expect(r.total).toBe(4);
    expect(r.done).toBe(2);
    expect(r.progress).toBe(50); // 2/4
  });
  it("weights progress by story points when present", () => {
    const r = rollup([
      { status: "Done", progress: 100, storyPoints: 8 },
      { status: "Todo", progress: 0, storyPoints: 2 },
    ]);
    expect(r.totalPoints).toBe(10);
    expect(r.donePoints).toBe(8);
    expect(r.progress).toBe(80); // 8/10 points
  });
  it("empty → 0", () => {
    expect(rollup([]).progress).toBe(0);
  });
});

describe("wouldCreateCycle", () => {
  // tree: A <- B <- C  (C's parent B, B's parent A)
  const parentOf = new Map<string, string | null>([
    ["A", null],
    ["B", "A"],
    ["C", "B"],
  ]);
  it("detects self-parent", () => {
    expect(wouldCreateCycle("A", "A", parentOf)).toBe(true);
  });
  it("detects making an ancestor a child of its descendant", () => {
    // set A's parent to C → cycle (C is under A)
    expect(wouldCreateCycle("A", "C", parentOf)).toBe(true);
  });
  it("allows a valid re-parent", () => {
    expect(wouldCreateCycle("C", "A", parentOf)).toBe(false);
    expect(wouldCreateCycle("B", null, parentOf)).toBe(false);
  });
});
