"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import {
  SSO_PROVIDERS,
  PROVIDER_LABELS,
  isProviderConfigured,
} from "@/lib/sso";

export type SsoSettingsState = { ok?: boolean; error?: string };

export type TenantSsoConfig = {
  domains: string;
  providers: Array<{
    provider: string;
    label: string;
    configured: boolean;
    enabled: boolean;
    autoProvision: boolean;
  }>;
};

/** Current SSO config for the active tenant (admin settings view). */
export async function getTenantSsoConfig(): Promise<TenantSsoConfig> {
  const { tenant } = await requireTenant();
  const rows = await prisma.tenantAuthProvider.findMany({
    where: { tenantId: tenant.id },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return {
    domains: (tenant as { ssoDomains?: string | null }).ssoDomains ?? "",
    providers: SSO_PROVIDERS.map((p) => ({
      provider: p,
      label: PROVIDER_LABELS[p],
      configured: isProviderConfigured(p),
      enabled: byProvider.get(p)?.enabled ?? false,
      autoProvision: byProvider.get(p)?.autoProvision ?? true,
    })),
  };
}

export async function saveTenantSsoAction(
  _prev: SsoSettingsState,
  formData: FormData
): Promise<SsoSettingsState> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { error: "FORBIDDEN" };

  const domains = (formData.get("domains")?.toString() ?? "").trim() || null;
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { ssoDomains: domains },
  });

  for (const p of SSO_PROVIDERS) {
    const enabled = formData.get(`enabled.${p}`) === "on";
    const autoProvision = formData.get(`auto.${p}`) === "on";
    await prisma.tenantAuthProvider.upsert({
      where: { tenantId_provider: { tenantId: tenant.id, provider: p } },
      update: { enabled, autoProvision },
      create: { tenantId: tenant.id, provider: p, enabled, autoProvision },
    });
  }

  revalidatePath("/settings");
  return { ok: true };
}
