"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { mintApiToken } from "@/lib/api-token";
import { KONTEXT_MAX_ZEICHEN } from "@/lib/kontext";

export type KontextSpeichernStand = { ok?: boolean; fehler?: string; unveraendert?: boolean };

/** Neue Fassung des Projekt-Kontexts. Nur Admins; jede Speicherung ist eine eigene Zeile (wer/wann). */
export async function speichereKontextAction(
  _vorher: KontextSpeichernStand,
  form: FormData,
): Promise<KontextSpeichernStand> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { fehler: "Nur Admins können den Kontext ändern." };
  const projectId = String(form.get("projectId") ?? "");
  const content = String(form.get("content") ?? "").replace(/\r\n/g, "\n");
  if (content.length > KONTEXT_MAX_ZEICHEN) return { fehler: `Höchstens ${KONTEXT_MAX_ZEICHEN} Zeichen.` };
  const projekt = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id, deletedAt: null }, select: { id: true } });
  if (!projekt) return { fehler: "Projekt nicht gefunden." };
  const letzte = await prisma.projectContext.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { content: true } });
  if (letzte && letzte.content === content) return { ok: true, unveraendert: true };
  await prisma.projectContext.create({ data: { projectId, content, userId: user.id } });
  revalidatePath(`/projects/${projectId}/kontext`);
  return { ok: true };
}

export type TokenErzeugenStand = { raw?: string; fehler?: string };
const ARTEN = { kontext: "kontext", kommentar: "kommentar" } as const;

/** Token für Agenten: Scope NUR „kontext“ oder NUR „kommentar“. Der Klartext wird genau einmal zurückgegeben. */
export async function erzeugeKontextTokenAction(
  _vorher: TokenErzeugenStand,
  form: FormData,
): Promise<TokenErzeugenStand> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { fehler: "Nur Admins können Tokens erzeugen." };
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const art = String(form.get("art") ?? "") as keyof typeof ARTEN;
  const tage = Number(form.get("tage") ?? 0);
  if (!name) return { fehler: "Bitte einen Namen angeben (z. B. „Cowork-Agent“)." };
  if (!(art in ARTEN)) return { fehler: "Unbekannte Art." };
  const t = mintApiToken();
  await prisma.apiToken.create({
    data: {
      name,
      tokenHash: t.tokenHash,
      prefix: t.prefix,
      userId: user.id,
      tenantId: tenant.id,
      scopes: ARTEN[art],
      expiresAt: Number.isFinite(tage) && tage > 0 ? new Date(Date.now() + tage * 86_400_000) : null,
    },
  });
  revalidatePath("/settings/kontext-token");
  return { raw: t.raw };
}

/** Widerrufen statt löschen (wie scripts/mcp-token.mjs) — nur Tokens dieses Mandanten mit engem Scope. */
export async function widerrufeKontextTokenAction(form: FormData): Promise<void> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return;
  const id = String(form.get("id") ?? "");
  await prisma.apiToken.updateMany({
    where: { id, tenantId: tenant.id, revokedAt: null, scopes: { in: ["kontext", "kommentar"] } },
    data: { revokedAt: new Date(), revokedBy: user.id },
  });
  revalidatePath("/settings/kontext-token");
}
