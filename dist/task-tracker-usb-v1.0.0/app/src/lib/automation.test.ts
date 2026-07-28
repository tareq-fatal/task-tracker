import { describe, it, expect } from "vitest";
import { matchingActions, type Rule } from "./automation";

const rule = (p: Partial<Rule>): Rule => ({
  id: "r", enabled: true, projectId: null, triggerType: "status_to", triggerValue: "Done",
  actionType: "set_priority", actionValue: "Low", ...p,
});

describe("matchingActions", () => {
  it("matches a status trigger and returns its action", () => {
    const got = matchingActions([rule({})], { type: "status_to", value: "Done", projectId: null });
    expect(got).toEqual([{ type: "set_priority", value: "Low" }]);
  });
  it("ignores disabled rules", () => {
    expect(matchingActions([rule({ enabled: false })], { type: "status_to", value: "Done", projectId: null })).toEqual([]);
  });
  it("respects trigger value", () => {
    expect(matchingActions([rule({})], { type: "status_to", value: "InProgress", projectId: null })).toEqual([]);
  });
  it("scopes by project when set", () => {
    const r = rule({ projectId: "p1" });
    expect(matchingActions([r], { type: "status_to", value: "Done", projectId: "p2" })).toEqual([]);
    expect(matchingActions([r], { type: "status_to", value: "Done", projectId: "p1" })).toHaveLength(1);
  });
  it("created trigger ignores value", () => {
    const r = rule({ triggerType: "created", triggerValue: null, actionType: "set_status", actionValue: "InProgress" });
    expect(matchingActions([r], { type: "created", projectId: null })).toEqual([{ type: "set_status", value: "InProgress" }]);
  });
  it("skips a no-op that sets the triggering field to the same value", () => {
    const r = rule({ triggerType: "status_to", triggerValue: "Done", actionType: "set_status", actionValue: "Done" });
    expect(matchingActions([r], { type: "status_to", value: "Done", projectId: null })).toEqual([]);
  });
});
