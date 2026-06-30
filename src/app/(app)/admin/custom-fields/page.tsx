import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getFieldDefs } from "@/actions/custom-fields";
import { CustomFieldsManager } from "@/components/custom-fields-manager";

export default async function CustomFieldsPage() {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());
  const defs = await getFieldDefs();

  return (
    <div className="container max-w-2xl py-6">
      <h1 className="text-2xl font-bold">{t["cf.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["cf.optionsHint"]}</p>
      <CustomFieldsManager initial={defs} />
    </div>
  );
}
