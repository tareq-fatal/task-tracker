#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Task-Tracker MCP server (stdio) for Claude Code and other MCP clients.
//
// DEPENDENCY-FREE ON PURPOSE. The product ships on-premise; asking an operator
// to npm-install an SDK on every machine that wants the integration is a cost
// with no upside here. MCP's stdio transport is newline-delimited JSON-RPC 2.0,
// which is short enough to implement directly and easy to audit.
//
// It is a thin client: every tool call becomes one `POST /api/mcp`
// {op, params}. All authorisation lives server-side (src/lib/mcp/*), so this
// file holds no rules — it cannot grant itself anything.
//
// Configuration (environment):
//   TASK_TRACKER_URL     base URL, e.g. https://tasks.coastshield.net
//   TASK_TRACKER_TOKEN   tt_mcp_… token (mint: npm run mcp:token)
//   TASK_TRACKER_STATE   optional path for the active-task file
//                        (default: <cwd>/.claude/task-tracker-active.json)
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SERVER_NAME = "task-tracker";
const SERVER_VERSION = "1.0.0";
const DEFAULT_PROTOCOL = "2024-11-05";

const BASE_URL = (process.env.TASK_TRACKER_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.TASK_TRACKER_TOKEN || "";
const STATE_FILE =
  process.env.TASK_TRACKER_STATE || path.join(process.cwd(), ".claude", "task-tracker-active.json");

/* ------------------------------------------------------------------ */
/* Active task — the pointer the prompt-log hook writes into           */
/* ------------------------------------------------------------------ */

async function readActiveTask() {
  try {
    if (!existsSync(STATE_FILE)) return null;
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.taskId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeActiveTask(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/* ------------------------------------------------------------------ */
/* HTTP client                                                         */
/* ------------------------------------------------------------------ */

async function callApi(op, params) {
  if (!BASE_URL) throw new Error("TASK_TRACKER_URL is not set");
  if (!TOKEN) throw new Error("TASK_TRACKER_TOKEN is not set");

  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ op, params }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status} from ${BASE_URL}/api/mcp (no JSON body)`);
  }
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.error ? `${payload.error} (HTTP ${res.status})` : `HTTP ${res.status}`);
  }
  return payload.data;
}

/* ------------------------------------------------------------------ */
/* MIME guessing for attachments (must match the server allowlist)     */
/* ------------------------------------------------------------------ */

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".md": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
};

/* ------------------------------------------------------------------ */
/* Tool definitions                                                    */
/* ------------------------------------------------------------------ */

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const bool = (description, extra = {}) => ({ type: "boolean", description, ...extra });
const int = (description, extra = {}) => ({ type: "integer", description, ...extra });

const STATUSES = ["Todo", "InProgress", "Done", "Archived"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const TYPES = ["Epic", "Story", "Task", "Subtask", "Bug"];

/**
 * `remote` tools map 1:1 onto an API op. `local` tools are handled in-process
 * (the active-task pointer) or wrap a remote op with extra client-side work
 * (reading a file off disk before uploading it).
 */
const TOOLS = [
  {
    name: "whoami",
    description: "Show which Task-Tracker user, tenant and permissions this MCP connection acts as.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    remote: "whoami",
  },
  {
    name: "list_tasks",
    description:
      "List or search tasks. Filter by status, priority, project, or `mine: true` for tasks assigned to me. Use `openOnly: true` to hide Done/Archived.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Free-text search across title and description"),
        status: str("Exact status filter", { enum: STATUSES }),
        priority: str("Exact priority filter", { enum: PRIORITIES }),
        projectId: str("Restrict to one project"),
        mine: bool("Only tasks assigned to me"),
        openOnly: bool("Hide Done and Archived tasks"),
        limit: int("Max rows (1-100, default 25)", { minimum: 1, maximum: 100 }),
      },
      additionalProperties: false,
    },
    remote: "list_tasks",
  },
  {
    name: "get_task",
    description:
      "Read one task in full: description, checklist steps, recent comments and attachments.",
    inputSchema: {
      type: "object",
      properties: { taskId: str("Task id") },
      required: ["taskId"],
      additionalProperties: false,
    },
    remote: "get_task",
  },
  {
    name: "create_task",
    description:
      "Create a task. Use this when the user describes work that should not be forgotten. Optionally seed the checklist via `steps`.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Short title (max 200 chars)"),
        description: str("Longer description / context"),
        status: str("Initial status (default Todo)", { enum: STATUSES }),
        priority: str("Priority (default Medium)", { enum: PRIORITIES }),
        type: str("Issue type (default Task)", { enum: TYPES }),
        projectId: str("Project to file it under"),
        assignedToUserId: str("Assignee user id (admins only; others get themselves)"),
        dueDate: str("Due date, ISO-8601 with offset, e.g. 2026-08-20T12:00:00Z"),
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Checklist steps to create with the task (max 30)",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    remote: "create_task",
  },
  {
    name: "update_task",
    description:
      "Update a task. Prefer `descriptionAppend` over `description` — it adds a paragraph instead of overwriting what is already documented.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: str("Task id"),
        title: str("New title"),
        description: str("REPLACES the whole description"),
        descriptionAppend: str("Appends a paragraph, keeping existing text"),
        status: str("New status", { enum: STATUSES }),
        priority: str("New priority", { enum: PRIORITIES }),
        projectId: str("Move to this project (null to detach)"),
        dueDate: str("New due date, ISO-8601 with offset (null to clear)"),
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    remote: "update_task",
  },
  {
    name: "add_comment",
    description:
      "Comment on a task. This notifies the task's watchers — for silent prompt journaling use log_prompt instead.",
    inputSchema: {
      type: "object",
      properties: { taskId: str("Task id"), content: str("Comment text (max 4000 chars)") },
      required: ["taskId", "content"],
      additionalProperties: false,
    },
    remote: "add_comment",
  },
  {
    name: "log_prompt",
    description:
      "Record an instruction/prompt on a task so it is not lost. Silent — no notifications. Defaults to the active task when taskId is omitted.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: str("Task id (defaults to the active task)"),
        prompt: str("The instruction text to preserve"),
        cwd: str("Working directory this came from"),
        branch: str("Git branch this came from"),
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    local: "log_prompt",
  },
  {
    name: "list_steps",
    description: "List a task's checklist steps (subtasks).",
    inputSchema: {
      type: "object",
      properties: { taskId: str("Task id") },
      required: ["taskId"],
      additionalProperties: false,
    },
    remote: "list_steps",
  },
  {
    name: "add_step",
    description: "Append a checklist step to a task.",
    inputSchema: {
      type: "object",
      properties: { taskId: str("Task id"), title: str("Step title (max 200 chars)") },
      required: ["taskId", "title"],
      additionalProperties: false,
    },
    remote: "add_step",
  },
  {
    name: "complete_step",
    description: "Tick a checklist step off, or reopen it with done=false.",
    inputSchema: {
      type: "object",
      properties: { stepId: str("Step id"), done: bool("false reopens the step (default true)") },
      required: ["stepId"],
      additionalProperties: false,
    },
    remote: "complete_step",
  },
  {
    name: "upload_attachment",
    description:
      "Attach a local file to a task (screenshot, log, report). Reads the file from disk and uploads it. Max 10 MB.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: str("Task id (defaults to the active task)"),
        path: str("Path to the local file to upload"),
        fileName: str("Display name (defaults to the file's own name)"),
      },
      required: ["path"],
      additionalProperties: false,
    },
    local: "upload_attachment",
  },
  {
    name: "list_projects",
    description: "List the projects I can see, with task counts.",
    inputSchema: {
      type: "object",
      properties: { limit: int("Max rows (1-100)", { minimum: 1, maximum: 100 }) },
      additionalProperties: false,
    },
    remote: "list_projects",
  },
  {
    name: "create_project",
    description: "Create a project (admins only).",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Project name"),
        description: str("What the project is about"),
        color: str("Hex colour, e.g. #6366f1"),
      },
      required: ["name"],
      additionalProperties: false,
    },
    remote: "create_project",
  },
  {
    name: "set_active_task",
    description:
      "Pin the task this working session belongs to. The UserPromptSubmit hook journals every prompt onto it, so nothing said in passing gets lost.",
    inputSchema: {
      type: "object",
      properties: { taskId: str("Task id to pin"), title: str("Title, for readable local state") },
      required: ["taskId"],
      additionalProperties: false,
    },
    local: "set_active_task",
  },
  {
    name: "get_active_task",
    description: "Show which task is currently pinned for prompt journaling.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    local: "get_active_task",
  },
];

/* ------------------------------------------------------------------ */
/* Local tool handlers                                                 */
/* ------------------------------------------------------------------ */

async function requireActiveTaskId(explicit) {
  if (explicit) return explicit;
  const active = await readActiveTask();
  if (!active?.taskId) {
    throw new Error("no taskId given and no active task pinned — call set_active_task first");
  }
  return active.taskId;
}

const LOCAL = {
  async set_active_task(args) {
    // Confirm the task exists and is reachable before pinning it, so a typo
    // surfaces now rather than silently swallowing every later prompt.
    const task = await callApi("get_task", { taskId: args.taskId });
    const state = { taskId: task.id, title: task.title, pinnedAt: new Date().toISOString() };
    await writeActiveTask(state);
    return { ...state, stateFile: STATE_FILE };
  },

  async get_active_task() {
    const active = await readActiveTask();
    if (!active) return { active: false, stateFile: STATE_FILE };
    return { active: true, ...active, stateFile: STATE_FILE };
  },

  async log_prompt(args) {
    const taskId = await requireActiveTaskId(args.taskId);
    return callApi("log_prompt", {
      taskId,
      prompt: args.prompt,
      ...(args.cwd ? { cwd: args.cwd } : {}),
      ...(args.branch ? { branch: args.branch } : {}),
    });
  },

  async upload_attachment(args) {
    const taskId = await requireActiveTaskId(args.taskId);
    const abs = path.resolve(args.path);
    const ext = path.extname(abs).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      throw new Error(
        `unsupported file type '${ext || "(none)"}' — allowed: ${Object.keys(MIME_BY_EXT).join(", ")}`
      );
    }
    const bytes = await readFile(abs);
    return callApi("upload_attachment", {
      taskId,
      fileName: args.fileName || path.basename(abs),
      mimeType,
      contentBase64: bytes.toString("base64"),
    });
  },
};

/* ------------------------------------------------------------------ */
/* JSON-RPC plumbing (MCP stdio: one JSON message per line)            */
/* ------------------------------------------------------------------ */

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Tool results are content blocks; JSON goes back as pretty-printed text. */
function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function toolError(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

async function handleToolCall(params) {
  const tool = TOOLS.find((t) => t.name === params?.name);
  if (!tool) return toolError(`unknown tool '${params?.name}'`);
  const args = params.arguments ?? {};
  try {
    const data = tool.local ? await LOCAL[tool.local](args) : await callApi(tool.remote, args);
    return toolResult(data);
  } catch (err) {
    // Errors come back as a tool result, not a protocol error: the model should
    // read "status change blocked: TODOS_OPEN" and react, not see a dead call.
    return toolError(err instanceof Error ? err.message : String(err));
  }
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  // Notifications carry no id and must never be answered.
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      respond(id, {
        protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;

    case "notifications/initialized":
    case "notifications/cancelled":
      return;

    case "tools/list":
      respond(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
      return;

    case "tools/call":
      respond(id, await handleToolCall(params));
      return;

    case "ping":
      respond(id, {});
      return;

    default:
      if (!isNotification) respondError(id, -32601, `method not found: ${method}`);
  }
}

/* ------------------------------------------------------------------ */
/* stdin loop                                                          */
/* ------------------------------------------------------------------ */

let buffer = "";
// Requests are handled concurrently, so stdin closing does NOT mean the work is
// done: a tool call waiting on the HTTP round-trip would be killed mid-flight
// and its response silently lost. Track what is in flight and drain first.
let inFlight = 0;
let stdinEnded = false;

function maybeExit() {
  if (stdinEnded && inFlight === 0) process.exit(0);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      continue;
    }
    inFlight++;
    handleMessage(msg)
      .catch((err) => {
        if (msg?.id !== undefined && msg?.id !== null) {
          respondError(msg.id, -32603, err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        inFlight--;
        maybeExit();
      });
  }
});

process.stdin.on("end", () => {
  stdinEnded = true;
  maybeExit();
});
// stdout must stay clean for the protocol — diagnostics go to stderr only.
process.on("uncaughtException", (err) => {
  process.stderr.write(`[task-tracker-mcp] ${err?.stack || err}\n`);
});
