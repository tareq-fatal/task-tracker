import { getActiveTenant } from "@/lib/tenant";
import { kontextAuth, text } from "@/lib/kontext-auth";
import { WissenFehler, exportDateien, type WissenNutzer } from "@/lib/wissen/dienst";
import { baueZip } from "@/lib/wissen/zip";

// TOF-0839: GET /api/wissen/export[?projectId=<id>] → ZIP mit einem Markdown-Ordner
// (README.md, eine .md je Seite mit YAML-Front-Matter, ENTSCHEIDUNGEN.md).
// Ohne projectId: alle Projekte, deren Wissen der Aufrufer lesen darf (je Projekt ein Ordner).
//
// Zwei Wege hinein, gleiche Regeln:
//  - Browser: Sitzungs-Cookie (Mandant wie überall aus requireTenant/getActiveTenant).
//  - CLI/Agent: Authorization: Bearer tt_mcp_… mit Scope „kontext“, read oder write.
//    curl -H "Authorization: Bearer $TOKEN" -o wissen.zip "$URL/api/wissen/export?projectId=…"
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  let nutzer: WissenNutzer;
  let tenantId: string;
  if (req.headers.get("authorization")) {
    const a = await kontextAuth(req, "lesen");
    if (!a.ok) return a.antwort;
    nutzer = a.ctx.user;
    tenantId = a.ctx.tenant.id;
  } else {
    const s = await getActiveTenant();
    if (!s) return text(401, "unauthorized");
    nutzer = s.user;
    tenantId = s.tenant.id;
  }

  const projectId = new URL(req.url).searchParams.get("projectId") || undefined;
  try {
    const { name, dateien } = await exportDateien(nutzer, tenantId, projectId);
    const zip = baueZip(dateien);
    const datum = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}-${datum}.zip"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    if (e instanceof WissenFehler) return text(e.status, e.message);
    console.error("[wissen] export failed:", e);
    return text(500, "internal error");
  }
}
