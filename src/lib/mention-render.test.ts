import { describe, it, expect } from "vitest";
import { splitMentions, unknownMentions, type KnownUser } from "./mention-render";
import { parseMentions } from "./notifications-core";

const KNOWN: KnownUser[] = [
  { id: "u1", username: "tarekfatal", name: "Tarek Fatal" },
  { id: "u2", username: "claude", name: "Claude" },
];

const texts = (segs: ReturnType<typeof splitMentions>) => segs.map((s) => s.value);

describe("splitMentions", () => {
  it("turns a known name into a mention and leaves the rest alone", () => {
    const segs = splitMentions("Bitte @tarekfatal ansehen.", KNOWN);
    expect(texts(segs)).toEqual(["Bitte ", "@tarekfatal", " ansehen."]);
    expect(segs[1]).toMatchObject({ type: "mention", userId: "u1", name: "Tarek Fatal" });
  });

  it("leaves an unknown name as plain text — never silently swallowed", () => {
    const segs = splitMentions("Hallo @tarekfatl, schau mal", KNOWN);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ type: "text", value: "Hallo @tarekfatl, schau mal" });
  });

  it("does not treat an email address as a mention", () => {
    const segs = splitMentions("schreib an claude@tasks.example", KNOWN);
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });

  it("handles a mention at the very start and several in one text", () => {
    const segs = splitMentions("@claude und @tarekfatal", KNOWN);
    expect(segs.filter((s) => s.type === "mention").map((s) => s.value)).toEqual([
      "@claude",
      "@tarekfatal",
    ]);
  });

  it("is case-insensitive on the name but keeps what was typed", () => {
    const segs = splitMentions("@TarekFatal", KNOWN);
    expect(segs[0]).toMatchObject({ type: "mention", value: "@TarekFatal", userId: "u1" });
  });

  it("reassembles to exactly the original text", () => {
    const input = "@claude: bitte @tarekfatal und @niemand fragen — a@b.de";
    expect(texts(splitMentions(input, KNOWN)).join("")).toBe(input);
  });

  it("agrees with parseMentions about what counts as a mention", () => {
    const input = "@claude a@b.de @tarekfatal @x";
    const rendered = splitMentions(input, KNOWN)
      .filter((s) => s.type === "mention")
      .map((s) => (s as { username: string }).username);
    // parseMentions finds the same names; the renderer additionally drops the
    // ones that do not exist ("x" is too short, "b.de" is an address).
    const parsed = parseMentions(input).filter((u) =>
      KNOWN.some((k) => k.username === u)
    );
    expect(rendered.sort()).toEqual(parsed.sort());
  });
});

describe("unknownMentions", () => {
  it("names the ones that reach nobody", () => {
    expect(unknownMentions("@tarekfatl und @claude", KNOWN)).toEqual(["tarekfatl"]);
  });

  it("is empty when everything resolves", () => {
    expect(unknownMentions("@claude @tarekfatal", KNOWN)).toEqual([]);
  });

  it("ignores email addresses", () => {
    expect(unknownMentions("mail an a@b.de", KNOWN)).toEqual([]);
  });
});
