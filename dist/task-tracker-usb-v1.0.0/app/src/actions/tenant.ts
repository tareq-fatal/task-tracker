"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { setTenantCookie } from "@/lib/tenant";
import { isSuperAdmin } from "@/lib/enums";

/** Switch the active tenant. SuperAdmin only; others are locked to their own. */
export async function switchTenantAction(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user.role)) return;
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return;
  setTenantCookie(slug);
  revalidatePath("/", "layout");
  redirect("/");
}
