import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { getProjectColumns } from "@/actions/workflow-columns";
import { WorkflowEditor } from "@/components/workflow-editor";

export default async function ProjectWorkflowPage({ params }: { params: { id: string } }) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project || project.tenantId !== tenant.id) notFound();

  const columns = await getProjectColumns(project.id);

  return (
    <div className="container max-w-3xl py-6">
      <Link href={`/projects/${project.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {project.name}
      </Link>
      <h1 className="text-2xl font-bold">{t["workflow.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["workflow.subtitle"]}</p>
      <WorkflowEditor projectId={project.id} initial={columns} />
    </div>
  );
}
