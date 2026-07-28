import "server-only";
import type { Locale } from "@/lib/enums";
import { makeExportT } from "./i18n-export";
import { hexToRgb } from "./pdf-core";
import { buildTaskWorkbook } from "./excel";
import { buildSprintPdf } from "./pdf-sprint";
import { buildActivityPdf } from "./pdf-activity";
import { buildKanbanPdf } from "./pdf-kanban";
import {
  loadTaskRows,
  loadSprintReport,
  loadActivityReport,
  loadKanban,
  pickDefaultSprintId,
} from "./data";
import { CONTENT_TYPE, type ExportParams, type GeneratedFile } from "./types";
import { exportBaseName } from "./util";

export type ExportTenantCtx = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogo: string | null;
  tenantPrimaryColor: string | null;
  fallbackUserId: string; // used when an activity report has no target user
};

/** Human error carrying an HTTP-ish status for the API layer. */
export class ExportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Produce the export file for `params`, scoped to `ctx.tenantId`. Pure of HTTP
 * concerns — used both by the synchronous API path and the queue runner.
 */
export async function generateExport(
  params: ExportParams,
  ctx: ExportTenantCtx,
  now: Date
): Promise<GeneratedFile> {
  const locale = params.locale;
  // Brand accent always applies; the logo image is opt-in per request.
  const accent = hexToRgb(ctx.tenantPrimaryColor);
  const logo = params.includeLogo ? ctx.tenantLogo : null;
  const t = makeExportT(locale);

  switch (params.kind) {
    case "tasks-excel": {
      const rows = await loadTaskRows(ctx.tenantId, params.filters ?? {});
      const buffer = buildTaskWorkbook(rows, {
        t,
        locale,
        tenantName: ctx.tenantName,
        filters: params.filters ?? {},
        groupBy: params.groupBy ?? "none",
      });
      return file(buffer, "xlsx", exportBaseName("tasks", ctx.tenantSlug, now), rows.length);
    }

    case "sprint-pdf": {
      const sprintId = params.sprintId || (await pickDefaultSprintId(ctx.tenantId));
      if (!sprintId) throw new ExportError(t("export.err.noSprint"), 404);
      const data = await loadSprintReport(ctx.tenantId, sprintId);
      if (!data) throw new ExportError(t("error.notFound"), 404);
      const buffer = await buildSprintPdf({
        data,
        locale,
        tenantName: ctx.tenantName,
        tenantLogo: logo,
        accent,
        now,
      });
      return file(buffer, "pdf", exportBaseName("sprint", ctx.tenantSlug, now), data.tasks.length);
    }

    case "activity-pdf": {
      const userId = params.targetUserId || ctx.fallbackUserId;
      const days = clampDays(params.activityDays);
      const data = await loadActivityReport(ctx.tenantId, userId, days, now);
      if (!data) throw new ExportError(t("error.notFound"), 404);
      const buffer = await buildActivityPdf({
        data,
        locale,
        tenantName: ctx.tenantName,
        tenantLogo: logo,
        accent,
        now,
      });
      return file(buffer, "pdf", exportBaseName("activity", ctx.tenantSlug, now), data.totals.assigned);
    }

    case "kanban-pdf": {
      const data = await loadKanban(ctx.tenantId, params.projectId ?? null, (s) =>
        t(("status." + s) as never)
      );
      const buffer = await buildKanbanPdf({
        data,
        locale,
        tenantName: ctx.tenantName,
        tenantLogo: logo,
        accent,
        now,
      });
      return file(buffer, "pdf", exportBaseName("kanban", ctx.tenantSlug, now), data.taskCount);
    }

    default:
      throw new ExportError("unknown export kind", 400);
  }
}

function clampDays(d: number | undefined): number {
  if (!d || !Number.isFinite(d)) return 30;
  return Math.min(365, Math.max(7, Math.round(d)));
}

function file(buffer: Buffer, ext: "xlsx" | "pdf", base: string, taskCount: number): GeneratedFile {
  return {
    buffer,
    fileName: `${base}.${ext}`,
    contentType: CONTENT_TYPE[ext],
    taskCount,
  };
}

/** Localised, human-readable name of an export kind (for job records/UI). */
export function exportKindLabel(kind: ExportParams["kind"], locale: Locale): string {
  return makeExportT(locale)(("export.kind." + kind) as never);
}
