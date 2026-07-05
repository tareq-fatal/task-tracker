import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getTenants } from "@/actions/tenants";
import { TenantWizard } from "@/components/tenant-wizard";
import { DeleteTenantButton } from "@/components/delete-tenant-button";

export default async function TenantsPage() {
  const { user } = await requireTenant();
  if (!can(user.role, "manageTenants")) redirect("/");
  const t = getDictionary(getActiveLocale());
  const tenants = await getTenants();

  return (
    <div className="container max-w-3xl py-6">
      <h1 className="text-2xl font-bold">{t["tenants.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["tenants.subtitle"]}</p>

      <ul className="mb-6 space-y-2">
        {tenants.map((tn) => (
          <li key={tn.id} className="flex items-center gap-3 rounded-lg border bg-card p-3" data-testid="tenant-row">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tn.primaryColor ?? "#4f46e5" }} />
            <span className="font-medium">{tn.name}</span>
            <code className="text-xs text-muted-foreground">/{tn.slug}</code>
            <span className="ms-auto text-xs text-muted-foreground">
              {tn.users} {t["tenants.users"]} · {tn.projects} {t["tenants.projects"]} · {tn.tasks} {t["tenants.tasks"]}
            </span>
            <DeleteTenantButton tenantId={tn.id} tenantName={tn.name} ownTenantId={user.tenantId} />
          </li>
        ))}
      </ul>

      <TenantWizard />
    </div>
  );
}
