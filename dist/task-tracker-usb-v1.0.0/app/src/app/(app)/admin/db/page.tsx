import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/enums";
import { getDbAudit } from "@/actions/db-admin";
import { DbConsole } from "@/components/db-console";

export default async function DbAdminPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user.role)) redirect("/");
  const audit = await getDbAudit();

  return (
    <div className="container py-6">
      <h1 className="mb-1 text-2xl font-bold">Database Console</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        SuperAdmin only · read-only by default · every query is audited · scoped to the Task-Tracker database.
      </p>
      <DbConsole initialAudit={audit} />
    </div>
  );
}
