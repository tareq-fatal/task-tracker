import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getWebhooks } from "@/actions/webhooks";
import { WebhooksManager } from "@/components/webhooks-manager";

export default async function WebhooksPage() {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());
  const webhooks = await getWebhooks();

  return (
    <div className="container max-w-3xl py-6">
      <h1 className="text-2xl font-bold">{t["webhook.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["webhook.subtitle"]}</p>
      <WebhooksManager initial={webhooks} />
    </div>
  );
}
