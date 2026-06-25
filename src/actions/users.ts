"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { userSchema } from "@/lib/validation";

export type UserFormState = { error?: string };

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

  // username is globally unique; email is unique within the tenant.
  const clash = await prisma.user.findFirst({
    where: {
      OR: [
        { username: d.username.toLowerCase() },
        { email: d.email.toLowerCase(), tenantId: tenant.id },
      ],
    },
  });
  if (clash) return { error: "Username or email already exists" };

  // Tenant admins can only create Admin/User; SuperAdmin role isn't assignable here.
  const role = d.role === "SuperAdmin" ? "User" : d.role;

  await prisma.user.create({
    data: {
      name: d.name,
      username: d.username.toLowerCase(),
      email: d.email.toLowerCase(),
      passwordHash: await hashPassword(d.password),
      role,
      tenantId: tenant.id,
    },
  });

  revalidatePath("/admin/users");
  return {};
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
