import { describe, expect, it } from "vitest";
import { activeMentionQuery, applyMention } from "./mentions-core";
import { parseMentions } from "./notifications-core";

describe("activeMentionQuery", () => {
  it("opens right after @ with an empty query", () => {
    expect(activeMentionQuery("@", 1)).toEqual({ query: "", start: 0 });
    expect(activeMentionQuery("hallo @", 7)).toEqual({ query: "", start: 6 });
  });

  it("collects the typed username, lower-cased", () => {
    expect(activeMentionQuery("hallo @Tar", 10)).toEqual({ query: "tar", start: 6 });
  });

  it("stays closed inside an email address", () => {
    expect(activeMentionQuery("mail an tarek@firma.de", 22)).toBeNull();
  });

  it("closes once the mention is finished by a space", () => {
    expect(activeMentionQuery("@tarek bitte", 12)).toBeNull();
  });

  it("only looks at the text before the caret", () => {
    // caret sits right behind "@ta", the rest of the line is irrelevant
    expect(activeMentionQuery("@tarek und @alice", 3)).toEqual({ query: "ta", start: 0 });
  });

  it("ignores a mention on an earlier line but catches the current one", () => {
    expect(activeMentionQuery("@alice\n@bo", 10)).toEqual({ query: "bo", start: 7 });
  });
});

describe("applyMention", () => {
  it("replaces the token and puts the caret behind the inserted name", () => {
    const token = activeMentionQuery("hallo @tar", 10)!;
    expect(applyMention("hallo @tar", token, "tarek")).toEqual({
      text: "hallo @tarek ",
      caret: 13,
    });
  });

  it("keeps the text that follows the caret", () => {
    const token = activeMentionQuery("@al bitte prüfen", 3)!;
    expect(applyMention("@al bitte prüfen", token, "alice").text).toBe(
      "@alice  bitte prüfen"
    );
  });

  it("produces text the server-side parser resolves again", () => {
    const token = activeMentionQuery("ping @cl", 8)!;
    const { text } = applyMention("ping @cl", token, "claude");
    expect(parseMentions(text)).toEqual(["claude"]);
  });
});
