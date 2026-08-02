"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { isTranslationEngine } from "@/lib/translate";

/** Admin: pick the translation provider for the own tenant —
 *  "auto" (DeepL first, LibreTranslate fallback) | "deepl" | "libre". */
export async function setTranslationEngineAction(engine: string): Promise<{ ok?: boolean; error?: string }> {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "editTenantSettings")) throw new Error("FORBIDDEN");
  if (!isTranslationEngine(engine)) return { error: "BAD_ENGINE" };
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { translationEngine: engine },
  });
  revalidatePath("/settings");
  return { ok: true };
}
