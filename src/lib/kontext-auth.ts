import "server-only";
import { authenticateMcp, type McpContext } from "@/lib/mcp/auth";
import { darfKommentieren, darfKontextLesen } from "@/lib/kontext";

/**
 * Bearer-Token prüfen (gleicher Weg wie das MCP: gehasht, widerrufbar, Ablauf, Benutzer aktiv,
 * Mandant passt) UND den engen Scope verlangen. Fehlertext bewusst vage.
 */
export async function kontextAuth(
  req: Request,
  braucht: "lesen" | "kommentieren",
): Promise<{ ok: true; ctx: McpContext } | { ok: false; antwort: Response }> {
  const auth = await authenticateMcp(req);
  if (!auth.ok) return { ok: false, antwort: text(auth.status, "unauthorized") };
  const erlaubt = braucht === "lesen" ? darfKontextLesen(auth.ctx.scopes) : darfKommentieren(auth.ctx.scopes);
  if (!erlaubt) return { ok: false, antwort: text(403, "forbidden") };
  return { ok: true, ctx: auth.ctx };
}

export function text(status: number, body: string, typ = "text/plain"): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": `${typ}; charset=utf-8`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
