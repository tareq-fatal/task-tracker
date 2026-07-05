import { describe, it, expect } from "vitest";
import {
  isBlockedByOpenDeps,
  openBlockers,
  isBlockedByLinks,
  isBlockingLink,
  normalizeDependencyEdge,
  wouldCreateDependencyCycle,
} from "./task-links";

describe("isBlockedByOpenDeps", () => {
  it("blocked when a DependsOn target is not Done/Archived", () => {
    expect(isBlockedByOpenDeps([{ type: "DependsOn", linkedStatus: "Todo" }])).toBe(true);
    expect(isBlockedByOpenDeps([{ type: "DependsOn", linkedStatus: "InProgress" }])).toBe(true);
  });
  it("not blocked when DependsOn targets are Done/Archived", () => {
    expect(isBlockedByOpenDeps([{ type: "DependsOn", linkedStatus: "Done" }])).toBe(false);
    expect(isBlockedByOpenDeps([{ type: "DependsOn", linkedStatus: "Archived" }])).toBe(false);
  });
  it("ignores non-DependsOn link types", () => {
    expect(isBlockedByOpenDeps([{ type: "RelatedTo", linkedStatus: "Todo" }])).toBe(false);
    expect(isBlockedByOpenDeps([{ type: "Blocks", linkedStatus: "Todo" }])).toBe(false);
    expect(isBlockedByOpenDeps([{ type: "SubtaskOf", linkedStatus: "Todo" }])).toBe(false);
  });
  it("openBlockers returns only the offending links", () => {
    const links = [
      { type: "DependsOn" as const, linkedStatus: "Todo" as const },
      { type: "DependsOn" as const, linkedStatus: "Done" as const },
      { type: "RelatedTo" as const, linkedStatus: "Todo" as const },
    ];
    expect(openBlockers(links)).toEqual([{ type: "DependsOn", linkedStatus: "Todo" }]);
  });
});

describe("isBlockedByLinks (bidirectional)", () => {
  it("an incoming open Blocks link blocks the task", () => {
    expect(isBlockedByLinks([{ type: "Blocks", direction: "in", linkedStatus: "Todo" }])).toBe(true);
    expect(isBlockedByLinks([{ type: "Blocks", direction: "in", linkedStatus: "InProgress" }])).toBe(true);
  });
  it("an incoming Blocks link from a Done/Archived task does not block", () => {
    expect(isBlockedByLinks([{ type: "Blocks", direction: "in", linkedStatus: "Done" }])).toBe(false);
    expect(isBlockedByLinks([{ type: "Blocks", direction: "in", linkedStatus: "Archived" }])).toBe(false);
  });
  it("an OUTGOING Blocks link never blocks the owning task", () => {
    expect(isBlockedByLinks([{ type: "Blocks", direction: "out", linkedStatus: "Todo" }])).toBe(false);
  });
  it("an INCOMING DependsOn link never blocks the target task", () => {
    expect(isBlockedByLinks([{ type: "DependsOn", direction: "in", linkedStatus: "Todo" }])).toBe(false);
  });
  it("RelatedTo/SubtaskOf never block in either direction", () => {
    expect(isBlockingLink({ type: "RelatedTo", direction: "in", linkedStatus: "Todo" })).toBe(false);
    expect(isBlockingLink({ type: "SubtaskOf", direction: "out", linkedStatus: "Todo" })).toBe(false);
  });
});

describe("normalizeDependencyEdge", () => {
  it("DependsOn: owner waits for target", () => {
    expect(normalizeDependencyEdge("a", "b", "DependsOn")).toEqual({ from: "a", to: "b" });
  });
  it("Blocks: target waits for owner (inverse)", () => {
    expect(normalizeDependencyEdge("a", "b", "Blocks")).toEqual({ from: "b", to: "a" });
  });
  it("other link types carry no dependency", () => {
    expect(normalizeDependencyEdge("a", "b", "RelatedTo")).toBeNull();
    expect(normalizeDependencyEdge("a", "b", "SubtaskOf")).toBeNull();
  });
});

describe("wouldCreateDependencyCycle", () => {
  it("self-edge is a cycle", () => {
    expect(wouldCreateDependencyCycle([], { from: "a", to: "a" })).toBe(true);
  });
  it("direct back-edge A→B + B→A is a cycle", () => {
    expect(
      wouldCreateDependencyCycle([{ from: "a", to: "b" }], { from: "b", to: "a" })
    ).toBe(true);
  });
  it("transitive cycle A→B→C + C→A is detected", () => {
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    expect(wouldCreateDependencyCycle(edges, { from: "c", to: "a" })).toBe(true);
  });
  it("parallel chains are not a cycle", () => {
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    expect(wouldCreateDependencyCycle(edges, { from: "a", to: "c" })).toBe(false);
    expect(wouldCreateDependencyCycle(edges, { from: "d", to: "a" })).toBe(false);
  });
  it("mixed link types: A DependsOn B + B DependsOn C, then C Blocks... A→ cycle via Blocks inversion", () => {
    const edges = [
      normalizeDependencyEdge("a", "b", "DependsOn")!,
      normalizeDependencyEdge("b", "c", "DependsOn")!,
    ];
    // "A Blocks C" normalizes to C-waits-for-A → closes the loop C→A→B→C? No:
    // edges are a→b, b→c; new edge c→a reaches a→b→c→(c===from) → cycle.
    expect(wouldCreateDependencyCycle(edges, normalizeDependencyEdge("a", "c", "Blocks")!)).toBe(true);
  });
  it("survives pre-existing loops in the graph without hanging", () => {
    const edges = [
      { from: "x", to: "y" },
      { from: "y", to: "x" }, // pre-existing loop elsewhere
    ];
    expect(wouldCreateDependencyCycle(edges, { from: "a", to: "x" })).toBe(false);
  });
});
