import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { getSprintsView } from "@/actions/sprints";
import { SprintBoard } from "@/components/sprint-board";

export default async function SprintsPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());
  const view = await getSprintsView(searchParams?.project);

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["sprint.title"]}</h1>
      <SprintBoard view={view} />
    </div>
  );
}
