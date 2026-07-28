"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { serializeEvents, isWebhookPreset, parseEvents } from "@/lib/webhooks";
import { sendTestWebhook } from "@/lib/webhooks-dispatch";

export type WebhookState = { ok?: boolean; error?: string };

export type WebhookLite = {
  id: string;
  name: string;
  url: string;
  events: string[];
  preset: string;
  enabled: boolean;
  secretMasked: string; // never expose the full secret to the client
  createdAt: string;
};

export type DeliveryLite = {
  id: string;
  event: string;
  status: string;
  statusCode: number | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

const ADMIN_PATH = "/admin/webhooks";

async function requireAdmin() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return { user, tenant };
}

function newSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

function maskSecret(secret: string): string {
  if (secret.length <= 10) return "••••";
  return `${secret.slice(0, 10)}…${secret.slice(-4)}`;
}

function validUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getWebhooks(): Promise<WebhookLite[]> {
  const { tenant } = await requireTenant();
  const rows = await prisma.webhook.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    url: w.url,
    events: parseEvents(w.events),
    preset: w.preset,
    enabled: w.enabled,
    secretMasked: maskSecret(w.secret),
    createdAt: w.createdAt.toISOString(),
  }));
}

export async function addWebhookAction(
  name: string,
  url: string,
  events: string[],
  preset: string
): Promise<WebhookState> {
  const { tenant } = await requireAdmin();
  const cleanName = name.trim();
  if (!cleanName) return { error: "EMPTY_NAME" };
  if (!validUrl(url.trim())) return { error: "BAD_URL" };
  if (!isWebhookPreset(preset)) return { error: "BAD_PRESET" };
  const events2 = serializeEvents(events);
  if (!events2) return { error: "NO_EVENTS" };

  await prisma.webhook.create({
    data: {
      tenantId: tenant.id,
      name: cleanName,
      url: url.trim(),
      secret: newSecret(),
      events: events2,
      preset,
    },
  });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updateWebhookAction(
  id: string,
  name: string,
  url: string,
  events: string[],
  preset: string
): Promise<WebhookState> {
  const { tenant } = await requireAdmin();
  const hook = await prisma.webhook.findFirst({ where: { id, tenantId: tenant.id } });
  if (!hook) return { error: "NOT_FOUND" };
  const cleanName = name.trim();
  if (!cleanName) return { error: "EMPTY_NAME" };
  if (!validUrl(url.trim())) return { error: "BAD_URL" };
  if (!isWebhookPreset(preset)) return { error: "BAD_PRESET" };
  const events2 = serializeEvents(events);
  if (!events2) return { error: "NO_EVENTS" };

  await prisma.webhook.update({
    where: { id },
    data: { name: cleanName, url: url.trim(), events: events2, preset },
  });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function toggleWebhookAction(id: string, enabled: boolean): Promise<WebhookState> {
  const { tenant } = await requireAdmin();
  const hook = await prisma.webhook.findFirst({ where: { id, tenantId: tenant.id } });
  if (!hook) return { error: "NOT_FOUND" };
  await prisma.webhook.update({ where: { id }, data: { enabled } });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function rotateSecretAction(id: string): Promise<WebhookState> {
  const { tenant } = await requireAdmin();
  const hook = await prisma.webhook.findFirst({ where: { id, tenantId: tenant.id } });
  if (!hook) return { error: "NOT_FOUND" };
  await prisma.webhook.update({ where: { id }, data: { secret: newSecret() } });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function deleteWebhookAction(id: string): Promise<WebhookState> {
  const { tenant } = await requireAdmin();
  const hook = await prisma.webhook.findFirst({ where: { id, tenantId: tenant.id } });
  if (!hook) return { error: "NOT_FOUND" };
  await prisma.webhook.delete({ where: { id } });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function sendTestAction(id: string): Promise<WebhookState> {
  const { tenant } = await requireAdmin();
  const hook = await prisma.webhook.findFirst({ where: { id, tenantId: tenant.id } });
  if (!hook) return { error: "NOT_FOUND" };
  const result = await sendTestWebhook({
    id: hook.id,
    url: hook.url,
    secret: hook.secret,
    preset: hook.preset,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });
  revalidatePath(ADMIN_PATH);
  if (!result.ok) {
    return { error: result.error ? `FAILED: ${result.error}` : "FAILED" };
  }
  return { ok: true };
}

export async function getDeliveries(webhookId: string): Promise<DeliveryLite[]> {
  const { tenant } = await requireTenant();
  // tenant-scope via the parent webhook
  const hook = await prisma.webhook.findFirst({ where: { id: webhookId, tenantId: tenant.id }, select: { id: true } });
  if (!hook) return [];
  const rows = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((d) => ({
    id: d.id,
    event: d.event,
    status: d.status,
    statusCode: d.statusCode,
    attempts: d.attempts,
    error: d.error,
    createdAt: d.createdAt.toISOString(),
    deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
  }));
}
