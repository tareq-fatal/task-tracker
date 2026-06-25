import { redirect } from "next/navigation";
import { FileUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { ImportClient } from "@/components/import-client";

export default async function AdminImportPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale());

  return (
    <div className="container max-w-3xl py-6">
      <div className="mb-1 flex items-center gap-2">
        <FileUp className="h-6 w-6 text-sky-600" />
        <h1 className="text-2xl font-bold">{t["import.title"]}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{t["import.subtitle"]}</p>
      <ImportClient />
    </div>
  );
}
