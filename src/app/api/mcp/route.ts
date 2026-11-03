import { NextRequest, NextResponse } from "next/server";
import { authenticateMcp, requireScope } from "@/lib/mcp/auth";
import { OPS, McpError, availableOps } from "@/lib/mcp/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// MCP endpoint — the HTTP surface behind mcp/task-tracker-mcp.mjs.
//
// Shape: ONE RPC route, `POST /api/mcp` with `{ "op": "...", "params": {...} }`.
// Deliberately not a REST tree: an agent calls tools by name, so a single
// dispatch point keeps the whole machine-facing surface to exactly one auth
// check, one scope check and one place to audit. That mirrors how the rest of
// the product works — Server Actions are RPC too (see docs/API-DOCS.md).
//
// Auth: `Authorization: Bearer tt_mcp_…`. The token binds a user AND a tenant;
// every operation runs with that user's role inside that mandant and cannot
// widen either. Fail-closed: no token / bad token / revoked / expired /
// deactivated user all return a flat 401 "unauthorized".
// ─────────────────────────────────────────────────────────────────────────────

/** Hard cap on the request body. 10 MB attachment + base64 overhead + slack. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Discovery: who am I, and which tools may this token use? */
export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!auth.ok) return fail(auth.status, auth.error);
  const { ctx } = auth;

  return NextResponse.json(
    {
      ok: true,
      user: { id: ctx.user.id, name: ctx.user.name, username: ctx.user.username, role: ctx.user.role },
      tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name },
      scopes: [...ctx.scopes],
      ops: availableOps(ctx.scopes).map((name) => ({
        name,
        scope: OPS[name].scope,
        describe: OPS[name].describe,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!auth.ok) return fail(auth.status, auth.error);
  const { ctx } = auth;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return fail(413, "request body too large");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid JSON body");
  }
  if (typeof body !== "object" || body === null) return fail(400, "body must be an object");

  const { op, params } = body as { op?: unknown; params?: unknown };
  if (typeof op !== "string" || !op) return fail(400, "missing 'op'");

  const operation = OPS[op];
  // Unknown op and forbidden op are both reported plainly — the op list is not
  // a secret (GET /api/mcp hands it out), only the data behind it is.
  if (!operation) return fail(404, `unknown op '${op}'`);
  // TOF-0839: alsoScope (nur Wissen-Ops: "kontext") reicht ebenfalls — sonst nichts.
  if (!requireScope(ctx, operation.scope) && !(operation.alsoScope && requireScope(ctx, operation.alsoScope))) {
    return fail(403, `op '${op}' requires the '${operation.scope}' scope`);
  }

  const parsed = operation.schema.safeParse(params ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    return fail(400, where ? `invalid params: ${where} — ${issue.message}` : "invalid params");
  }

  try {
    const data = await operation.run(ctx, parsed.data as never);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof McpError) return fail(err.status, err.message);
    // Never leak a stack or a Prisma message to a machine caller.
    console.error(`[mcp] op=${op} user=${ctx.user.username} failed:`, err);
    return fail(500, "internal error");
  }
}
