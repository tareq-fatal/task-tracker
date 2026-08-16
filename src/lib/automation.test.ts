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

describe("Ablauf-Kette: Spaltenwechsel setzt die Zuständigkeit", () => {
  const rule = (col: string, owner: string): Rule => ({
    id: `r-${col}`,
    enabled: true,
    projectId: null,
    triggerType: "column_to",
    triggerValue: col,
    actionType: "assign_to",
    actionValue: owner,
  });
  const RULES = [
    rule("in-progress", "claude"),
    rule("self-test", "claude"),
    rule("to-verify", "tarekfatal"),
    rule("release", "claude"),
  ];

  it("gibt Schritt 3 an den Auftraggeber und alles andere an den Bearbeiter", () => {
    const owner = (col: string) =>
      matchingActions(RULES, { type: "column_to", value: col, projectId: null })
        .filter((a) => a.type === "assign_to")
        .map((a) => a.value);
    expect(owner("in-progress")).toEqual(["claude"]);
    expect(owner("self-test")).toEqual(["claude"]);
    expect(owner("to-verify")).toEqual(["tarekfatal"]);
    expect(owner("release")).toEqual(["claude"]);
  });

  it("fasst Spalten außerhalb der Kette nicht an", () => {
    expect(matchingActions(RULES, { type: "column_to", value: "done", projectId: null })).toEqual([]);
    expect(matchingActions(RULES, { type: "column_to", value: "waiting", projectId: null })).toEqual([]);
  });

  it("verwechselt einen Spaltenwechsel nicht mit einem Statuswechsel", () => {
    // "InProgress" ist der Status HINTER drei Spalten — ein Statuswechsel darf
    // die Zuständigkeit deshalb nicht umhängen, sonst rutscht eine Aufgabe in
    // Schritt 3 beim nächsten Speichern zurück an den Bearbeiter.
    expect(matchingActions(RULES, { type: "status_to", value: "InProgress", projectId: null })).toEqual([]);
  });

  it("gilt nur im eigenen Projekt, wenn die Regel eines nennt", () => {
    const scoped = [{ ...rule("to-verify", "tarekfatal"), projectId: "p1" }];
    expect(matchingActions(scoped, { type: "column_to", value: "to-verify", projectId: "p1" })).toHaveLength(1);
    expect(matchingActions(scoped, { type: "column_to", value: "to-verify", projectId: "p2" })).toHaveLength(0);
  });
});
