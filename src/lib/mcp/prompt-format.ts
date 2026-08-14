// Formatting for journaled Claude Code prompts. Pure and free of server-only
// imports so it is unit-testable — ops.ts consumes it.

/** Prefix that marks a comment as machine-written, for the UI and for humans. */
export const PROMPT_MARKER = "🤖 Claude Code";

/**
 * Cap on the prompt text itself. TaskComment.content has no DB limit, but the
 * UI comment box validates at 4000 chars (commentSchema) and a journal entry
 * should not be able to produce a comment no human could have written.
 */
export const MAX_PROMPT_CHARS = 3500;

export type PromptEntry = {
  prompt: string;
  cwd?: string | null;
  branch?: string | null;
  at: Date;
};

/**
 * Render one journal entry:
 *
 *   🤖 Claude Code
 *
 *   <the prompt>
 *
 *   — task-tracker · feature/foo · 2026-08-14 09:12
 *
 * The trailing context line is what makes an entry useful weeks later: which
 * checkout and which branch the instruction was given in.
 */
export function formatPromptComment(input: PromptEntry): string {
  const trimmed = input.prompt.trim();
  const body = trimmed.slice(0, MAX_PROMPT_CHARS);
  const ellipsis = trimmed.length > MAX_PROMPT_CHARS ? " […]" : "";
  const context = [input.cwd, input.branch].filter(Boolean).join(" · ");
  const stamp = input.at.toISOString().replace("T", " ").slice(0, 16);
  const footer = context ? `— ${context} · ${stamp}` : `— ${stamp}`;
  return `${PROMPT_MARKER}\n\n${body}${ellipsis}\n\n${footer}`;
}
