import type { Event } from "@sentry/nextjs";

// Field names redacted anywhere they appear in an event's request/extra/context
// payloads — covers our own session cookie plus generic secret-shaped keys any
// integration might pick up (form bodies, headers, logged args).
const SENSITIVE_KEY = /pass(word)?|token|secret|authoriz|cookie|api[-_]?key|session/i;
const REDACTED = "[Filtered]";

function redact(value: unknown, seen = new Set<unknown>()): unknown {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
    } else if (typeof out[key] === "object") {
      out[key] = redact(out[key], seen);
    }
  }
  return out;
}

/** Shared beforeSend/beforeSendTransaction hook for all three Sentry runtimes
 *  (server, edge, client). Strips session cookies, auth headers, and any
 *  password/token/secret-shaped field before the event leaves the process. */
export function scrubSensitiveData<T extends Event>(event: T): T {
  if (event.request) {
    if (event.request.cookies) event.request.cookies = REDACTED as never;
    if (event.request.headers) {
      event.request.headers = redact(event.request.headers) as never;
    }
    if (event.request.data) {
      event.request.data = redact(event.request.data) as never;
    }
  }
  if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts;

  return event;
}
