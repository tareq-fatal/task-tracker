#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Claude Code UserPromptSubmit hook — journals every prompt onto the pinned
// Task-Tracker task.
//
// WHY A HOOK AND NOT A TOOL: a tool only runs when the model decides to call
// it, and "remember to log this" is exactly the kind of instruction that gets
// dropped once a conversation gets busy. A hook is executed by the environment
// on every single prompt, so the journal cannot silently stop being written.
//
// FAIL-OPEN, ALWAYS. A missing token, an unreachable server, a slow network —
// none of it may ever block or delay the user's prompt. Every failure path
// exits 0 and stays quiet; diagnostics go to stderr, never stdout (whatever a
// UserPromptSubmit hook prints on stdout is injected into the model's context).
//
// Pin a task first:  set_active_task  (MCP tool), or write .claude/task-tracker-active.json
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";

/** Hard ceiling on the whole hook — the prompt must not wait on the network. */
const TIMEOUT_MS = 4000;

function bail(reason) {
  if (reason && process.env.TASK_TRACKER_HOOK_DEBUG) {
    process.stderr.write(`[prompt-log-hook] ${reason}\n`);
  }
  process.exit(0); // never block the prompt
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function currentBranch(cwd) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd, timeout: 1000 },
      (err, stdout) => resolve(err ? null : stdout.trim() || null)
    );
  });
}

async function main() {
  const baseUrl = (process.env.TASK_TRACKER_URL || "").replace(/\/+$/, "");
  const token = process.env.TASK_TRACKER_TOKEN || "";
  if (!baseUrl || !token) return bail("TASK_TRACKER_URL/TASK_TRACKER_TOKEN not set");

  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return bail("hook payload was not JSON");
  }

  const prompt = typeof event?.prompt === "string" ? event.prompt.trim() : "";
  if (!prompt) return bail("empty prompt");

  const cwd = event?.cwd || process.cwd();
  const stateFile =
    process.env.TASK_TRACKER_STATE || path.join(cwd, ".claude", "task-tracker-active.json");
  if (!existsSync(stateFile)) return bail("no active task pinned");

  let taskId;
  try {
    taskId = JSON.parse(await readFile(stateFile, "utf8"))?.taskId;
  } catch {
    return bail("active-task state unreadable");
  }
  if (!taskId) return bail("active-task state has no taskId");

  const branch = await currentBranch(cwd);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        op: "log_prompt",
        params: {
          taskId,
          prompt,
          cwd: path.basename(cwd),
          ...(branch ? { branch } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return bail(`API returned HTTP ${res.status}`);
  } catch (err) {
    return bail(`request failed: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }

  process.exit(0);
}

main().catch((err) => bail(`unexpected: ${err?.message ?? err}`));
