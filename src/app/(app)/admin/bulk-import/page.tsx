import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { isAdminRole } from "@/lib/enums";
import { BulkImportClient } from "@/components/bulk-import-client";

export default async function AdminBulkImportPage() {
  const { user: me } = await requireTenant();
  if (!isAdminRole(me.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  return (
    <div className="container max-w-4xl py-6">
      <div className="mb-1 flex items-center gap-2">
        <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-bold">{t["bulkImport.title"]}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {t["bulkImport.subtitle"]}
      </p>
      <BulkImportClient />
    </div>
  );
}
