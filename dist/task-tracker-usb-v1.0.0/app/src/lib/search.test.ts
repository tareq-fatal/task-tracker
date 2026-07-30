import { describe, expect, it } from "vitest";
import {
  SEARCH_MAX_CHARS,
  SEARCH_MAX_TOKENS,
  dedupeItems,
  normalizeQuery,
  snippet,
  tokenize,
  tokensWhere,
  type SearchItem,
} from "./search";

describe("normalizeQuery", () => {
  it("trims whitespace", () => {
    expect(normalizeQuery("  login bug  ")).toBe("login bug");
  });

  it("clamps overlong input", () => {
    expect(normalizeQuery("x".repeat(500))).toHaveLength(SEARCH_MAX_CHARS);
  });
});

describe("tokenize", () => {
  it("splits on any whitespace", () => {
    expect(tokenize("login\t bug\n fix")).toEqual(["login", "bug", "fix"]);
  });

  it("drops empty tokens and caps the count", () => {
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("a b c d e f g")).toHaveLength(SEARCH_MAX_TOKENS);
  });

  it("keeps unicode (Arabic) intact", () => {
    expect(tokenize("مهمة جديدة")).toEqual(["مهمة", "جديدة"]);
  });
});

describe("tokensWhere", () => {
  it("requires every token in at least one field", () => {
    expect(tokensWhere(["login", "bug"], ["title", "description"])).toEqual({
      AND: [
        {
          OR: [
            { title: { contains: "login", mode: "insensitive" } },
            { description: { contains: "login", mode: "insensitive" } },
          ],
        },
        {
          OR: [
            { title: { contains: "bug", mode: "insensitive" } },
            { description: { contains: "bug", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("yields an empty AND for no tokens (matches everything — used for pools)", () => {
    expect(tokensWhere([], ["title"])).toEqual({ AND: [] });
  });
});

describe("dedupeItems", () => {
  const item = (type: SearchItem["type"], id: string): SearchItem => ({
    type,
    id,
    title: id,
    href: "/",
  });

  it("removes later duplicates but keeps same id across types", () => {
    const out = dedupeItems([
      item("task", "1"),
      item("task", "2"),
      item("task", "1"),
      item("project", "1"),
    ]);
    expect(out.map((i) => `${i.type}:${i.id}`)).toEqual([
      "task:1",
      "task:2",
      "project:1",
    ]);
  });
});

describe("snippet", () => {
  it("returns short text untouched", () => {
    expect(snippet("hello world", ["hello"])).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(snippet("a\n\n  b", [])).toBe("a b");
  });

  it("centres the excerpt on a late match", () => {
    const text = "x".repeat(200) + " NEEDLE " + "y".repeat(200);
    const out = snippet(text, ["needle"], 60);
    expect(out).toContain("NEEDLE");
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.startsWith("…")).toBe(true);
  });

  it("falls back to the head when nothing matches", () => {
    const out = snippet("z".repeat(200), ["needle"], 50);
    expect(out.startsWith("zzz")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });
});
