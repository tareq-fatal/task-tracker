import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getBranding } from "@/actions/branding";
import { BrandingSettings } from "@/components/branding-settings";

export default async function BrandingPage() {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "editTenantSettings")) redirect("/");
  const t = getDictionary(getActiveLocale());
  const branding = await getBranding();

  return (
    <div className="container max-w-3xl py-6">
      <h1 className="text-2xl font-bold">{t["brand.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["brand.subtitle"]}</p>
      <BrandingSettings initial={branding} tenantName={tenant.name} />
    </div>
  );
}
