"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { can, canEditUserTarget, assignableRoles } from "@/lib/roles";
import { userSchema } from "@/lib/validation";

export type UserFormState = { error?: string; tempPassword?: string; createdUsername?: string };

/** A readable temporary password, e.g. "Task-7f3a9c". */
function generateTempPassword(): string {
  return `Task-${randomBytes(4).toString("hex")}`;
}

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? "User",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }
  const d = parsed.data;
  const email = d.email ? d.email.toLowerCase() : null; // #31 — optional

  // username is globally unique; email (when given) is unique within the tenant.
  const clash = await prisma.user.findFirst({
    where: {
      OR: [
        { username: d.username.toLowerCase() },
        ...(email ? [{ email, tenantId: tenant.id }] : []),
      ],
    },
  });
  if (clash) return { error: "Username or email already exists" };

  // Assignable roles depend on the actor: BackendAdmin may create Admins,
  // tenant admins only SubAdmin/User. Anything else collapses to User.
  const role = (assignableRoles(user.role) as string[]).includes(d.role) ? d.role : "User";

  // #31 — no password given → generate a temporary one the admin hands over;
  // the account is flagged to force a change on next login.
  const tempPassword = d.password ? undefined : generateTempPassword();
  const password = d.password || tempPassword!;

  await prisma.user.create({
    data: {
      name: d.name,
      username: d.username.toLowerCase(),
      email,
      passwordHash: await hashPassword(password),
      mustChangePassword: Boolean(tempPassword),
      role,
      tenantId: tenant.id,
    },
  });

  revalidatePath("/admin/users");
  return tempPassword ? { tempPassword, createdUsername: d.username.toLowerCase() } : {};
}

export async function deleteUserAction(userId: string): Promise<void> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  if (user.id === userId) throw new Error("CANNOT_DELETE_SELF");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!canEditUserTarget(user.role, target.role)) throw new Error("FORBIDDEN");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

/* ---------------- SubAdmin-capable user management ---------------- */

/** Shared guard: actor may manage users at all AND may touch THIS target. */
async function assertUserTarget(userId: string) {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "manageUsersBasic")) throw new Error("FORBIDDEN");
  if (user.id === userId) throw new Error("CANNOT_EDIT_SELF");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!canEditUserTarget(user.role, target.role)) throw new Error("FORBIDDEN");
  return { actor: user, tenant, target };
}

/** Edit basic fields of an existing user (Admin + SubAdmin). */
export async function updateUserBasicAction(
  userId: string,
  input: { name: string; email: string; phone: string; locale: string }
): Promise<{ ok?: boolean; error?: string }> {
  const { tenant, target } = await assertUserTarget(userId);
  const name = input.name.trim();
  if (!name) return { error: "EMPTY_NAME" };
  const email = input.email.trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "BAD_EMAIL" };
  const locale = ["ar", "de", "en", "tr"].includes(input.locale) ? input.locale : target.locale;
  if (email && email !== target.email) {
    const clash = await prisma.user.findFirst({
      where: { email, tenantId: tenant.id, id: { not: userId } },
    });
    if (clash) return { error: "EMAIL_TAKEN" };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { name, email, phone: input.phone.trim() || null, locale },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Deactivate (Admin + SubAdmin) / reactivate (Admin ONLY, per order). */
export async function setUserActiveAction(
  userId: string,
  active: boolean
): Promise<{ ok?: boolean; error?: string }> {
  if (active) {
    // Reactivation is an admin-only decision.
    const { user, tenant } = await requireTenant();
    if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== tenant.id) throw new Error("NOT_FOUND");
    await prisma.user.update({
      where: { id: userId },
      data: { deactivatedAt: null, deactivatedBy: null },
    });
  } else {
    const { actor } = await assertUserTarget(userId);
    await prisma.user.update({
      where: { id: userId },
      data: { deactivatedAt: new Date(), deactivatedBy: actor.id },
    });
    // Kill the user's sessions so the block is immediate, not on next login.
    await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Reset a user's password to a fresh temp password (never shown to the
 *  target's old value; the account is forced to change it on next login). */
export async function resetUserPasswordAction(
  userId: string
): Promise<{ tempPassword?: string; error?: string }> {
  await assertUserTarget(userId);
  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
  });
  await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
  revalidatePath("/admin/users");
  return { tempPassword };
}

/** Change a user's role — admin-level only, within assignableRoles. */
export async function changeUserRoleAction(
  userId: string,
  role: string
): Promise<{ ok?: boolean; error?: string }> {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "manageUsers")) throw new Error("FORBIDDEN");
  if (user.id === userId) return { error: "CANNOT_EDIT_SELF" };
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!canEditUserTarget(user.role, target.role)) throw new Error("FORBIDDEN");
  if (!(assignableRoles(user.role) as string[]).includes(role)) throw new Error("FORBIDDEN");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  return { ok: true };
}
