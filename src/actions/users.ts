"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
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

  // Tenant admins can only create Admin/User; the backend/system admin role
  // (BackendAdmin / legacy SuperAdmin) is never assignable via this form.
  const role = d.role === "BackendAdmin" ? "User" : d.role;

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
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}
