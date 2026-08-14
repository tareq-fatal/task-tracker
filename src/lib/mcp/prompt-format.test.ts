import { describe, it, expect } from "vitest";
import { formatPromptComment, PROMPT_MARKER, MAX_PROMPT_CHARS } from "./prompt-format";

const at = new Date("2026-08-14T09:12:45Z");

describe("formatPromptComment", () => {
  it("marks the entry as machine-written and keeps the prompt verbatim", () => {
    const out = formatPromptComment({ prompt: "Fix the Gantt export", at });
    expect(out.startsWith(PROMPT_MARKER)).toBe(true);
    expect(out).toContain("Fix the Gantt export");
  });

  it("records checkout and branch when known, so an entry is readable weeks later", () => {
    const out = formatPromptComment({
      prompt: "Add a filter",
      cwd: "task-tracker",
      branch: "feature/mcp",
      at,
    });
    expect(out).toContain("— task-tracker · feature/mcp · 2026-08-14 09:12");
  });

  it("falls back to a bare timestamp when there is no context", () => {
    const out = formatPromptComment({ prompt: "Add a filter", at });
    expect(out).toContain("— 2026-08-14 09:12");
    expect(out).not.toContain("·");
  });

  it("includes whichever half of the context it has", () => {
    expect(formatPromptComment({ prompt: "x", cwd: "repo", at })).toContain("— repo · 2026-08-14");
    expect(formatPromptComment({ prompt: "x", branch: "main", at })).toContain("— main · 2026-08-14");
  });

  it("trims surrounding whitespace instead of storing a blank-looking comment", () => {
    const out = formatPromptComment({ prompt: "   spaced   ", at });
    expect(out).toContain("\n\nspaced\n\n");
  });

  it("truncates an oversized prompt and says so", () => {
    const out = formatPromptComment({ prompt: "a".repeat(MAX_PROMPT_CHARS + 500), at });
    expect(out).toContain("[…]");
    // marker + body + ellipsis + footer must stay well under the 4000-char
    // limit the UI comment box enforces.
    expect(out.length).toBeLessThan(4000);
  });

  it("leaves a prompt exactly at the limit untruncated", () => {
    const out = formatPromptComment({ prompt: "a".repeat(MAX_PROMPT_CHARS), at });
    expect(out).not.toContain("[…]");
  });

  it("keeps multi-line prompts intact — code blocks survive the journal", () => {
    const prompt = "Refactor this:\n\n```ts\nconst x = 1;\n```";
    expect(formatPromptComment({ prompt, at })).toContain("```ts\nconst x = 1;\n```");
  });
});
