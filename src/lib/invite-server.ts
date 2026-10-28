import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { SITE_URL } from "./seo";
import { inviteUrl, mintInviteToken, originFromHeaders } from "./invite";

// Server half of the invite link (TOF-0783, Tarek 28.10.2026). Deliberately
// NOT in a "use server" file: everything exported there becomes a callable
// endpoint, and issueInvite must only run behind the callers' auth checks
// (createInviteAction, createUserAction).

/** Origin for links shown to the admin: request headers, else APP_URL / SITE_URL. */
export function requestOrigin(): string {
  return originFromHeaders(headers(), process.env.APP_URL || SITE_URL);
}

/**
 * Mint a fresh invite for `userId` in `tenantId` and return the full link —
 * the ONLY time the raw token exists. Older open invites of the same user are
 * invalidated (usedAt = now), never deleted. Caller has already checked that
 * the user lives in `tenantId` and that the actor may manage them.
 */
export async function issueInvite(input: {
  tenantId: string;
  userId: string;
  createdById: string;
}): Promise<string> {
  const now = new Date();
  const minted = mintInviteToken(now);
  await prisma.$transaction([
    prisma.invite.updateMany({
      where: { tenantId: input.tenantId, userId: input.userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.invite.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
        createdById: input.createdById,
      },
    }),
  ]);
  return inviteUrl(requestOrigin(), minted.raw);
}
