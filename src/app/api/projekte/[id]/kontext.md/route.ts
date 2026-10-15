import { kontextAuth, text } from "@/lib/kontext-auth";
import { kontextBasis, ladeKontexte } from "@/lib/kontext-laden";
import { projektKontextMd } from "@/lib/kontext";

// GET /api/projekte/<id>/kontext.md — ein Projekt voll: Kontext + Aufgabenliste.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const a = await kontextAuth(req, "lesen");
  if (!a.ok) return a.antwort;
  const [eins] = await ladeKontexte(a.ctx.user, a.ctx.tenant.id, params.id);
  // Unbekannt und nicht sichtbar sehen gleich aus — kein Hinweis, ob es das Projekt gibt.
  if (!eins) return text(404, "not found");
  return text(200, projektKontextMd(eins.p, eins.aufgaben, kontextBasis(), new Date()), "text/markdown");
}
