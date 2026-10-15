import { kontextAuth } from "@/lib/kontext-auth";
import { McpError, OPS } from "@/lib/mcp/ops";

// POST /api/aufgaben/<id>/kommentar  { "text": "…" } — Kommentar an eine Aufgabe.
// Eigener enger Scope „kommentar“ (oder write). Läuft durch dieselbe Operation wie das MCP
// (add_comment): gleiche Sichtprüfung, Aktivitätslog, @-Erwähnungen, Benachrichtigungen.
export const dynamic = "force-dynamic";
const MAX_BYTES = 16_384;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await kontextAuth(req, "kommentieren");
  if (!a.ok) return a.antwort;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return json(413, { ok: false, error: "zu gross" });
  let body: { text?: unknown; content?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "JSON erwartet: { \"text\": \"…\" }" });
  }
  const op = OPS.add_comment;
  const parsed = op.schema.safeParse({ taskId: params.id, content: body?.text ?? body?.content });
  if (!parsed.success) return json(400, { ok: false, error: "text fehlt oder ist zu lang (1–4000 Zeichen)" });
  try {
    const data = await op.run(a.ctx, parsed.data as never);
    return json(201, { ok: true, data });
  } catch (err) {
    if (err instanceof McpError) return json(err.status, { ok: false, error: err.message });
    console.error("[kommentar] fehlgeschlagen:", err);
    return json(500, { ok: false, error: "internal error" });
  }
}
