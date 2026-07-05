// Outbound webhooks — pure, framework-free helpers (unit-tested).
//
// The dispatch/HTTP side lives in webhooks-dispatch.ts (server-only). This file
// holds everything that can be reasoned about without a DB or network: the event
// catalogue, event-subscription matching, HMAC signing, the retry/backoff
// schedule, and the per-preset body transform (Slack/Teams/Discord/generic).

import { createHmac } from "crypto";

export const WEBHOOK_EVENTS = [
  "task.created",
  "task.completed",
  "sprint.closed",
  "comment.added",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(v: string): v is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(v);
}

export const WEBHOOK_PRESETS = ["generic", "slack", "teams", "discord"] as const;
export type WebhookPreset = (typeof WEBHOOK_PRESETS)[number];

export function isWebhookPreset(v: string): v is WebhookPreset {
  return (WEBHOOK_PRESETS as readonly string[]).includes(v);
}

// Retries: 3 attempts total. Delay BEFORE attempt N (1-indexed) grows
// exponentially. attempt 1 → 0ms (fire immediately), 2 → base, 3 → base*2, …
export const WEBHOOK_MAX_ATTEMPTS = 3;

export function backoffMs(attempt: number, baseMs = 1000): number {
  if (attempt <= 1) return 0;
  return baseMs * 2 ** (attempt - 2);
}

/** Parse a stored comma-separated event list into a clean, de-duplicated array. */
export function parseEvents(csv: string | null | undefined): WebhookEvent[] {
  if (!csv) return [];
  const seen = new Set<string>();
  const out: WebhookEvent[] = [];
  for (const raw of csv.split(",")) {
    const e = raw.trim();
    if (isWebhookEvent(e) && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

/** Serialize a selection back to storage form (order-stable, de-duplicated). */
export function serializeEvents(events: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of events) {
    if (isWebhookEvent(e) && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out.join(",");
}

/** Is this webhook subscribed to `event`? */
export function matchesEvent(subscribedCsv: string, event: string): boolean {
  return parseEvents(subscribedCsv).includes(event as WebhookEvent);
}

// The canonical JSON envelope we POST for every event (before preset transform).
export type WebhookEnvelope = {
  event: WebhookEvent;
  timestamp: string; // ISO-8601
  tenant: { id: string; slug: string };
  data: Record<string, unknown>;
};

/**
 * HMAC-SHA256 signature of the exact request body, hex-encoded. Sent as the
 * `X-Webhook-Signature: sha256=<hex>` header so receivers can verify integrity.
 */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function signatureHeader(secret: string, body: string): string {
  return `sha256=${signPayload(secret, body)}`;
}

/** A short, human-readable one-liner describing the event (used by chat presets). */
export function summarize(env: WebhookEnvelope): string {
  const d = env.data;
  const title = (d.title as string) ?? (d.name as string) ?? "";
  switch (env.event) {
    case "task.created":
      return `🆕 New task: *${title}*${d.projectName ? ` (${d.projectName})` : ""}`;
    case "task.completed":
      return `✅ Task completed: *${title}*${d.projectName ? ` (${d.projectName})` : ""}`;
    case "sprint.closed":
      return `🏁 Sprint closed: *${title}*${d.projectName ? ` (${d.projectName})` : ""}`;
    case "comment.added":
      return `💬 New comment on *${d.taskTitle ?? ""}* by ${d.author ?? "someone"}: ${d.excerpt ?? ""}`;
    default:
      return env.event;
  }
}

/** Theme colour used by the Teams MessageCard, per event. */
function themeColor(event: WebhookEvent): string {
  switch (event) {
    case "task.completed":
      return "2eb886"; // green
    case "sprint.closed":
      return "8e5cff"; // purple
    case "comment.added":
      return "0ea5e9"; // sky
    default:
      return "f2c744"; // amber (task.created)
  }
}

/**
 * Transform the canonical envelope into the JSON body a given preset expects.
 * - generic → the envelope verbatim (full fidelity for custom receivers)
 * - slack   → { text }
 * - discord → { content }
 * - teams   → Office 365 connector MessageCard
 */
export function buildPresetBody(preset: string, env: WebhookEnvelope): unknown {
  const text = summarize(env);
  switch (preset) {
    case "slack":
      return { text };
    case "discord":
      // Discord uses **bold**, not *bold* — normalize the summary's emphasis.
      return { content: text.replace(/\*([^*]+)\*/g, "**$1**") };
    case "teams":
      return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: themeColor(env.event),
        summary: `${env.event}`,
        // Teams renders **bold**; reuse Discord-style emphasis.
        text: text.replace(/\*([^*]+)\*/g, "**$1**"),
      };
    case "generic":
    default:
      return env;
  }
}
