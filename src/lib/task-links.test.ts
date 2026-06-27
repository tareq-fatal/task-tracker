import { describe, it, expect } from "vitest";
import { isBlockedByOpenDeps, openBlockers } from "./task-links";

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
