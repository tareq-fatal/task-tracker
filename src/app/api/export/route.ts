import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isLocale, type Locale } from "@/lib/enums";
import { getActiveLocale } from "@/lib/locale";
import { generateExport, ExportError, type ExportTenantCtx } from "@/lib/export/generate";
import { estimateTaskCount } from "@/lib/export/data";
import { enqueueExport, triggerExportSoon } from "@/lib/export-runner";
import {
  EXPORT_SYNC_LIMIT,
  isExportKind,
  isTaskGroupBy,
  type ExportParams,
  type TaskExportFilters,
} from "@/lib/export/types";

// jsPDF + xlsx need the Node runtime (Buffers, no edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let ctxUser;
  try {
    ctxUser = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { user, tenant } = ctxUser;
  // Exports are a reporting feature — admin-gated like /reports.
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isExportKind(body.kind)) {
    return NextResponse.json({ error: "invalid export kind" }, { status: 400 });
  }

  const locale: Locale = isLocale(body.locale as string) ? (body.locale as Locale) : getActiveLocale();
  const filters = sanitizeFilters(body.filters);
  const params: ExportParams = {
    kind: body.kind,
    locale,
    includeLogo: body.includeLogo === true,
    filters,
    groupBy: isTaskGroupBy(body.groupBy) ? body.groupBy : "none",
    sprintId: str(body.sprintId),
    targetUserId: str(body.targetUserId),
    activityDays: typeof body.activityDays === "number" ? body.activityDays : undefined,
    projectId: str(body.projectId),
  };

  const ctx: ExportTenantCtx = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantLogo: tenant.logo,
    tenantPrimaryColor: tenant.primaryColor,
    fallbackUserId: user.id,
  };

  const count = await estimateTaskCount(tenant.id, params.kind, {
    filters,
    sprintId: params.sprintId,
    projectId: params.projectId,
  });

  // Large exports go async: queue + email. Everything else renders inline.
  if (count > EXPORT_SYNC_LIMIT) {
    const job = await enqueueExport({
      params,
      ctx,
      taskCount: count,
      user: { id: user.id, name: user.name, email: user.email },
    });
    triggerExportSoon(job.id);
    return NextResponse.json(
      {
        queued: true,
        jobId: job.id,
        taskCount: count,
        statusUrl: `/api/export/jobs/${job.id}`,
        emailed: Boolean(user.email),
      },
      { status: 202 }
    );
  }

  try {
    const gen = await generateExport(params, ctx, new Date());
    return new NextResponse(new Uint8Array(gen.buffer), {
      status: 200,
      headers: {
        "Content-Type": gen.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(gen.fileName)}`,
        "Content-Length": String(gen.buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ExportError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[export] generation failed", e);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function sanitizeFilters(v: unknown): TaskExportFilters {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  return {
    status: str(o.status),
    priority: str(o.priority),
    projectId: str(o.projectId),
    teamId: str(o.teamId),
    assigneeId: str(o.assigneeId),
    sprintId: str(o.sprintId),
    search: str(o.search),
  };
}
