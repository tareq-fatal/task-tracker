import "server-only";
import { prisma } from "@/lib/prisma";
import {
  parseBearer,
  hashApiToken,
  hashesMatch,
  parseScopes,
  isTokenUsable,
  hasScope,
  type ApiScope,
} from "@/lib/api-token";

/**
 * The identity every MCP operation runs as. There is no way to construct one
 * except by presenting a valid token, and the user/tenant pair comes straight
 * off the token row — an operation can neither pick its actor nor its mandant.
 */
export type McpContext = {
  user: { id: string; name: string; username: string; role: string; locale: string };
  tenant: { id: string; slug: string; name: string };
  scopes: Set<ApiScope>;
  tokenId: string;
};

export type McpAuthResult =
  | { ok: true; ctx: McpContext }
  | { ok: false; status: number; error: string };

/**
 * Resolve `Authorization: Bearer tt_mcp_…` into an McpContext.
 *
 * Fail-closed at every step, and deliberately vague in the error text: a caller
 * holding a bad token learns only "unauthorized", never whether the token
 * existed, expired, was revoked or belonged to a deactivated user.
 */
export async function authenticateMcp(req: Request): Promise<McpAuthResult> {
  const raw = parseBearer(req.headers.get("authorization"));
  if (!raw) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const tokenHash = hashApiToken(raw);
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      tokenHash: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      tenantId: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          locale: true,
          tenantId: true,
          deactivatedAt: true,
        },
      },
      tenant: { select: { id: true, slug: true, name: true } },
    },
  });

  if (!row || !hashesMatch(row.tokenHash, tokenHash)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (!isTokenUsable(row)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  // A deactivated account keeps its tokens on disk but must not be able to act
  // (mirrors the login block in lib/auth.ts).
  if (row.user.deactivatedAt) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  // Defence in depth: the token carries a denormalized tenantId. If the user
  // ever moved mandants, the two disagree — refuse rather than guess which one
  // wins, because guessing wrong is a cross-tenant write.
  if (row.user.tenantId !== row.tenantId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  // Best-effort "last seen" for the token list; never fails the request.
  void prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    ok: true,
    ctx: {
      user: {
        id: row.user.id,
        name: row.user.name,
        username: row.user.username,
        role: row.user.role,
        locale: row.user.locale,
      },
      tenant: row.tenant,
      scopes: parseScopes(row.scopes),
      tokenId: row.id,
    },
  };
}

/** Guard used by the route before dispatching a write-scoped operation. */
export function requireScope(ctx: McpContext, needed: ApiScope): boolean {
  return hasScope(ctx.scopes, needed);
}
