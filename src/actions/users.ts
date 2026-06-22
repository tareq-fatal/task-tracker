"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { userSchema } from "@/lib/validation";

export type UserFormState = { error?: string };

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireAdmin();
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

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: d.username.toLowerCase() }, { email: d.email.toLowerCase() }],
    },
  });
  if (existing) {
    return { error: "Username or email already exists" };
  }

  await prisma.user.create({
    data: {
      name: d.name,
      username: d.username.toLowerCase(),
      email: d.email.toLowerCase(),
      passwordHash: await hashPassword(d.password),
      role: d.role,
    },
  });

  revalidatePath("/admin/users");
  return {};
}

export async function deleteUserAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("CANNOT_DELETE_SELF");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}
