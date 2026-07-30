import "server-only";
import { prisma } from "./prisma";
import {
  WEBHOOK_MAX_ATTEMPTS,
  backoffMs,
  matchesEvent,
  buildPresetBody,
  signatureHeader,
  type WebhookEvent,
  type WebhookEnvelope,
} from "./webhooks";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_LEN = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type WebhookRow = {
  id: string;
  url: string;
  secret: string;
  preset: string;
};

/**
 * One HTTP POST attempt. Resolves with the outcome — never throws. A non-2xx
 * response OR a network/timeout error both count as a failure (retryable).
 */
async function attemptPost(
  url: string,
  body: string,
  signature: string
): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TaskTracker-Webhooks/1.0",
        "X-Webhook-Signature": signature,
      },
      body,
      signal: controller.signal,
    });
    const ok = res.status >= 200 && res.status < 300;
    let error: string | null = null;
    if (!ok) {
      const text = await res.text().catch(() => "");
      error = `HTTP ${res.status}: ${text}`.slice(0, MAX_ERROR_LEN);
    }
    return { ok, statusCode: res.status, error };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, statusCode: null, error: msg.slice(0, MAX_ERROR_LEN) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver one envelope to one webhook with exponential-backoff retries, updating
 * the given delivery row after every attempt. Best-effort — swallows all errors.
 * The body is preset-transformed and HMAC-signed per attempt (signature is stable
 * because the body is).
 */
async function deliverWithRetry(
  webhook: WebhookRow,
  deliveryId: string,
  envelope: WebhookEnvelope
): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
  const body = JSON.stringify(buildPresetBody(webhook.preset, envelope));
  const signature = signatureHeader(webhook.secret, body);

  let last: { ok: boolean; statusCode: number | null; error: string | null } = {
    ok: false,
    statusCode: null,
    error: "not attempted",
  };

  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
    const wait = backoffMs(attempt);
    if (wait > 0) await sleep(wait);

    last = await attemptPost(webhook.url, body, signature);
    await prisma.webhookDelivery
      .update({
        where: { id: deliveryId },
        data: {
          attempts: attempt,
          status: last.ok ? "success" : "failed",
          statusCode: last.statusCode,
          error: last.error,
          ...(last.ok || attempt === WEBHOOK_MAX_ATTEMPTS ? { deliveredAt: new Date() } : {}),
        },
      })
      .catch(() => {});

    if (last.ok) break;
  }
  return last;
}

/**
 * Fan an event out to every enabled webhook in the tenant that subscribes to it.
 * Records a delivery row per webhook and drives retries in the background
 * (fire-and-forget) so the caller's mutation is never blocked. Best-effort.
 */
export async function dispatchWebhookEvent(args: {
  tenantId: string;
  tenantSlug: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const hooks = await prisma.webhook.findMany({
      where: { tenantId: args.tenantId, enabled: true },
    });
    const targets = hooks.filter((h) => matchesEvent(h.events, args.event));
    if (targets.length === 0) return;

    const envelope: WebhookEnvelope = {
      event: args.event,
      timestamp: new Date().toISOString(),
      tenant: { id: args.tenantId, slug: args.tenantSlug },
      data: args.data,
    };
    const payloadForLog = JSON.stringify(envelope, null, 2);

    for (const h of targets) {
      const delivery = await prisma.webhookDelivery.create({
        data: { webhookId: h.id, event: args.event, payload: payloadForLog, status: "pending" },
      });
      // Fire-and-forget: retries run in the background on the persistent server.
      void deliverWithRetry(h, delivery.id, envelope).catch(() => {});
    }
  } catch {
    // webhooks must never break the underlying mutation
  }
}

/**
 * Send a synthetic test payload to a single webhook and AWAIT the result (used by
 * the "Send test" button so the admin gets immediate feedback). Records a
 * delivery row like a real event.
 */
export async function sendTestWebhook(webhook: {
  id: string;
  url: string;
  secret: string;
  preset: string;
  tenantId: string;
  tenantSlug: string;
}): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
  const envelope: WebhookEnvelope = {
    event: "task.created",
    timestamp: new Date().toISOString(),
    tenant: { id: webhook.tenantId, slug: webhook.tenantSlug },
    data: {
      id: "test-0000",
      title: "Test webhook payload",
      status: "Todo",
      priority: "Medium",
      projectName: "Demo",
      test: true,
    },
  };
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event: "test",
      payload: JSON.stringify(envelope, null, 2),
      status: "pending",
    },
  });
  return deliverWithRetry(webhook, delivery.id, envelope);
}
