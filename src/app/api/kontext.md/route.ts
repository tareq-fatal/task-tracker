import { kontextAuth, text } from "@/lib/kontext-auth";
import { kontextBasis, ladeKontexte } from "@/lib/kontext-laden";
import { alleKontexteMd } from "@/lib/kontext";

// GET /api/kontext.md — alle sichtbaren Projekte kompakt (Kontext gekürzt + wichtigste offene Aufgaben).
// Authorization: Bearer tt_mcp_… mit Scope „kontext“ (oder read/write).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await kontextAuth(req, "lesen");
  if (!a.ok) return a.antwort;
  const liste = await ladeKontexte(a.ctx.user, a.ctx.tenant.id);
  return text(200, alleKontexteMd(liste, kontextBasis(), new Date()), "text/markdown");
}
