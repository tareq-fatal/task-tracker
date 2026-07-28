import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getRules } from "@/actions/automation";
import { AutomationManager } from "@/components/automation-manager";

export default async function AutomationPage() {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());
  const rules = await getRules();

  return (
    <div className="container max-w-3xl py-6">
      <h1 className="text-2xl font-bold">{t["auto.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["auto.subtitle"]}</p>
      <AutomationManager initial={rules} />
    </div>
  );
}
