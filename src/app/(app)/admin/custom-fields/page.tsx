import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getFieldDefs } from "@/actions/custom-fields";
import { CustomFieldsManager } from "@/components/custom-fields-manager";

export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams?: { project?: string };
}) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  // Ignore a stale/foreign project id → fall back to tenant-wide scope.
  const scope = searchParams?.project && projects.some((p) => p.id === searchParams.project)
    ? searchParams.project
    : "";
  const defs = await getFieldDefs(scope || null);

  return (
    <div className="container max-w-2xl py-6">
      <h1 className="text-2xl font-bold">{t["cf.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["cf.optionsHint"]}</p>
      <CustomFieldsManager initial={defs} projects={projects} scope={scope} />
    </div>
  );
}
