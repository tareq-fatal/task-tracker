import { describe, it, expect } from "vitest";
import {
  WEBHOOK_EVENTS,
  isWebhookEvent,
  isWebhookPreset,
  backoffMs,
  parseEvents,
  serializeEvents,
  matchesEvent,
  signPayload,
  signatureHeader,
  summarize,
  buildPresetBody,
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookEnvelope,
} from "./webhooks";

const env = (over: Partial<WebhookEnvelope> = {}): WebhookEnvelope => ({
  event: "task.created",
  timestamp: "2026-07-05T10:00:00.000Z",
  tenant: { id: "t1", slug: "acme" },
  data: { id: "task1", title: "Ship it", projectName: "Web" },
  ...over,
});

describe("event catalogue", () => {
  it("recognizes valid events and presets", () => {
    expect(isWebhookEvent("task.created")).toBe(true);
    expect(isWebhookEvent("task.deleted")).toBe(false);
    expect(isWebhookPreset("slack")).toBe(true);
    expect(isWebhookPreset("carrier-pigeon")).toBe(false);
  });
});

describe("backoff", () => {
  it("fires the first attempt immediately then grows exponentially", () => {
    expect(backoffMs(1)).toBe(0);
    expect(backoffMs(2)).toBe(1000);
    expect(backoffMs(3)).toBe(2000);
    expect(backoffMs(2, 500)).toBe(500);
    expect(backoffMs(3, 500)).toBe(1000);
  });
  it("caps retries at 3 attempts", () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(3);
  });
});

describe("event (de)serialization", () => {
  it("parses, trims, drops unknowns and de-dupes", () => {
    expect(parseEvents("task.created, task.completed")).toEqual(["task.created", "task.completed"]);
    expect(parseEvents("task.created,bogus,task.created")).toEqual(["task.created"]);
    expect(parseEvents("")).toEqual([]);
    expect(parseEvents(null)).toEqual([]);
  });
  it("serializes only valid events, de-duplicated", () => {
    expect(serializeEvents(["task.created", "bogus", "task.created"])).toBe("task.created");
    expect(serializeEvents([...WEBHOOK_EVENTS])).toBe(WEBHOOK_EVENTS.join(","));
  });
  it("matchesEvent checks subscription membership", () => {
    expect(matchesEvent("task.created,sprint.closed", "sprint.closed")).toBe(true);
    expect(matchesEvent("task.created", "comment.added")).toBe(false);
  });
});

describe("HMAC signing", () => {
  it("is deterministic and secret-dependent", () => {
    const body = JSON.stringify({ a: 1 });
    const s1 = signPayload("secret", body);
    const s2 = signPayload("secret", body);
    const s3 = signPayload("other", body);
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("matches a known vector (sha256 hmac hex)", () => {
    // node: crypto.createHmac('sha256','key').update('hello').digest('hex')
    expect(signPayload("key", "hello")).toBe(
      "9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b"
    );
  });
  it("prefixes the header with sha256=", () => {
    expect(signatureHeader("key", "hello")).toBe(
      "sha256=9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b"
    );
  });
});

describe("summarize", () => {
  it("describes each event type", () => {
    expect(summarize(env())).toContain("New task");
    expect(summarize(env({ event: "task.completed" }))).toContain("completed");
    expect(summarize(env({ event: "sprint.closed", data: { name: "Sprint 3", projectName: "Web" } }))).toContain("Sprint 3");
    expect(
      summarize(env({ event: "comment.added", data: { taskTitle: "Bug", author: "Sam", excerpt: "looks off" } }))
    ).toContain("Sam");
  });
});

describe("preset body transform", () => {
  it("returns the envelope verbatim for generic", () => {
    const e = env();
    expect(buildPresetBody("generic", e)).toBe(e);
  });
  it("maps to Slack { text }", () => {
    const body = buildPresetBody("slack", env()) as { text: string };
    expect(body.text).toContain("Ship it");
    // Slack keeps single-asterisk emphasis
    expect(body.text).toContain("*Ship it*");
  });
  it("maps to Discord { content } with ** emphasis", () => {
    const body = buildPresetBody("discord", env()) as { content: string };
    expect(body.content).toContain("**Ship it**");
  });
  it("maps to a Teams MessageCard", () => {
    const body = buildPresetBody("teams", env({ event: "task.completed" })) as Record<string, string>;
    expect(body["@type"]).toBe("MessageCard");
    expect(body.themeColor).toBe("2eb886");
    expect(body.text).toContain("**");
  });
  it("falls back to generic for an unknown preset", () => {
    const e = env();
    expect(buildPresetBody("myspace", e)).toBe(e);
  });
});
