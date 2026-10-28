"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, hashPassword } from "@/lib/auth";
import { requireTenant, setTenantCookie } from "@/lib/tenant";
import { setLocaleCookie } from "@/lib/locale";
import { can, canEditUserTarget } from "@/lib/roles";
import { isLocale, isSuperAdmin } from "@/lib/enums";
import { issueInvite } from "@/lib/invite-server";
import {
  checkNewPassword,
  hashInviteToken,
  inviteUsable,
  isPlausibleInviteToken,
  type NewPasswordError,
} from "@/lib/invite";

// Einladungslink zum Passwort-Setzen (TOF-0783, Tarek 28.10.2026).

export type InviteLinkState = { link?: string; error?: string };

/**
 * Admin of the tenant (or the Superuser inside the ACTIVE tenant) mints an
 * invite link for one user of that tenant. The link is returned exactly once;
 * older open invites of the user stop working.
 */
export async function createInviteAction(userId: string): Promise<InviteLinkState> {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "manageUsers")) return { error: "FORBIDDEN" };
  if (user.id === userId) return { error: "CANNOT_EDIT_SELF" };
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenant.id },
    select: { id: true, role: true, deactivatedAt: true },
  });
  if (!target) return { error: "NOT_FOUND" };
  if (!canEditUserTarget(user.role, target.role)) return { error: "FORBIDDEN" };
  if (target.deactivatedAt) return { error: "DEACTIVATED" };

  const link = await issueInvite({ tenantId: tenant.id, userId: target.id, createdById: user.id });
  revalidatePath("/admin/users");
  return { link };
}

export type RedeemInviteState = { error?: NewPasswordError | "INVALID" };

/**
 * Public (no login): set the password through an invite link. Every invalid
 * case — unknown, expired, used, deactivated, user/tenant mismatch — gives the
 * same neutral "INVALID". On success: password set, mustChangePassword off,
 * invite consumed, all existing sessions of the user ended, then the user is
 * signed in exactly like loginAction does (session + locale/tenant cookies).
 */
export async function redeemInviteAction(
  _prev: RedeemInviteState,
  formData: FormData
): Promise<RedeemInviteState> {
  const raw = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (!isPlausibleInviteToken(raw)) return { error: "INVALID" };

  // Allowlisted in tenant-isolation.test.ts: looked up by the unique hash, then
  // tenant + user binding is verified by inviteUsable() below.
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashInviteToken(raw) },
    include: {
      user: { select: { id: true, tenantId: true, deactivatedAt: true, locale: true, role: true, tenant: { select: { slug: true } } } },
    },
  });
  const now = new Date();
  if (!invite || !inviteUsable(invite, invite.user, now)) return { error: "INVALID" };

  const pwError = checkNewPassword(password, repeat);
  if (pwError) return { error: pwError };

  const passwordHash = await hashPassword(password);
  const claimed = await prisma.$transaction(async (tx) => {
    // Single use, race-safe: only the request that flips usedAt wins.
    const c = await tx.invite.updateMany({
      where: { id: invite.id, tenantId: invite.tenantId, userId: invite.userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (c.count !== 1) return false;
    await tx.user.update({
      where: { id: invite.userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.deleteMany({ where: { userId: invite.userId } });
    return true;
  });
  if (!claimed) return { error: "INVALID" };

  // Whatever session this browser had (e.g. an admin testing the link) ends.
  await destroySession();
  await createSession(invite.userId);
  if (isLocale(invite.user.locale)) setLocaleCookie(invite.user.locale);
  // Same as loginAction: remember the tenant for the login page's branding,
  // but never overwrite a Superuser's tenant-switcher selection.
  if (!isSuperAdmin(invite.user.role)) setTenantCookie(invite.user.tenant.slug);
  redirect("/");
}
