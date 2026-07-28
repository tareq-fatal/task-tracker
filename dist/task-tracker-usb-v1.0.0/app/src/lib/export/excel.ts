import * as XLSX from "xlsx";
import type { TKey } from "@/lib/i18n";
import type { ExportT } from "./i18n-export";
import type { TaskGroupBy, TaskExportFilters } from "./types";
import type { TaskRow } from "./data";

type LabelInput = {
  t: ExportT;
  locale: string;
  tenantName: string;
  filters: TaskExportFilters;
  groupBy: TaskGroupBy;
};

function statusLabel(t: ExportT, s: string): string {
  return t(`status.${s}` as TKey);
}
function priorityLabel(t: ExportT, p: string): string {
  return t(`priority.${p}` as TKey);
}
function typeLabel(t: ExportT, ty: string): string {
  return t(`type.${ty}` as TKey);
}

function dateCell(d: Date | null): Date | string {
  return d ?? "";
}

/** The value used to bucket a row when grouping. */
function groupKey(t: ExportT, row: TaskRow, by: TaskGroupBy): string {
  switch (by) {
    case "status": return statusLabel(t, row.status);
    case "priority": return priorityLabel(t, row.priority);
    case "project": return row.projectName ?? t("task.noProject");
    case "assignee": return row.assigneeName ?? t("task.unassigned");
    default: return "";
  }
}

/**
 * Build the task-list workbook. Two layouts:
 *  - groupBy "none"  → one flat table with an Excel AutoFilter + frozen header.
 *  - groupBy X       → rows sorted into collapsible outline groups, each with a
 *                      header row ("▸ Label (count)") above its details.
 * Plus a Summary sheet (tenant, filters, status/priority breakdown). The
 * workbook is set right-to-left for the Arabic locale.
 */
export function buildTaskWorkbook(rows: TaskRow[], meta: LabelInput): Buffer {
  const { t, groupBy } = meta;

  const headers = [
    t("task.title"),
    t("task.type"),
    t("task.status"),
    t("task.priority"),
    t("task.project"),
    t("task.assignee"),
    t("task.team"),
    t("nav.sprints"),
    t("task.dueDate"),
    t("task.storyPoints"),
    t("task.estimated"),
    t("task.spent"),
    t("task.progress"),
    t("task.createdBy"),
  ];

  const rowToCells = (r: TaskRow): (string | number | Date)[] => [
    r.title,
    typeLabel(t, r.type),
    statusLabel(t, r.status),
    priorityLabel(t, r.priority),
    r.projectName ?? "",
    r.assigneeName ?? "",
    r.teamName ?? "",
    r.sprintName ?? "",
    dateCell(r.dueDate),
    r.storyPoints ?? "",
    r.estimatedHours ?? "",
    r.spentHours ?? 0,
    r.progress / 100, // percent-formatted
    dateCell(r.createdAt),
  ];

  const aoa: (string | number | Date)[][] = [headers];
  const rowLevels: number[] = [0]; // outline level per sheet row (header = 0)

  if (groupBy === "none") {
    for (const r of rows) {
      aoa.push(rowToCells(r));
      rowLevels.push(0);
    }
  } else {
    // Sort by group label, then push a title row + detail rows per group.
    const withKey = rows.map((r) => ({ r, key: groupKey(t, r, groupBy) }));
    withKey.sort((a, b) => a.key.localeCompare(b.key) || 0);
    let current: string | null = null;
    let bucket: TaskRow[] = [];
    const flush = () => {
      if (current === null) return;
      aoa.push([`▸ ${current}  (${bucket.length})`]);
      rowLevels.push(0);
      for (const r of bucket) {
        aoa.push(rowToCells(r));
        rowLevels.push(1);
      }
    };
    for (const { r, key } of withKey) {
      if (key !== current) {
        flush();
        current = key;
        bucket = [];
      }
      bucket.push(r);
    }
    flush();
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  // Column widths (chars).
  ws["!cols"] = [
    { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 },
    { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 12 },
  ];

  // Number/date/percent formats on the relevant columns (skip header row).
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = 1; R <= range.e.r; R++) {
    setFmt(ws, R, 8, "yyyy-mm-dd"); // dueDate
    setFmt(ws, R, 13, "yyyy-mm-dd"); // createdAt
    setFmt(ws, R, 12, "0%"); // progress
  }

  // Freeze the header row.
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  // SheetJS reads panes from '!freeze' only via some writers; also set '!panes'.
  (ws as unknown as { "!panes"?: unknown })["!panes"] = [
    { ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" },
  ];

  if (groupBy === "none") {
    ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  } else {
    // Apply outline levels for collapsible groups; summary (title) row above.
    ws["!rows"] = rowLevels.map((lvl) => (lvl > 0 ? { level: lvl } : {}));
    (ws as unknown as { "!outline"?: unknown })["!outline"] = { above: true };
  }

  const wb = XLSX.utils.book_new();
  if (meta.locale === "ar") wb.Workbook = { Views: [{ RTL: true }] };

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(rows, meta), t("reports.title").slice(0, 28) || "Summary");
  XLSX.utils.book_append_sheet(wb, ws, t("nav.admin.tasks").slice(0, 28) || "Tasks");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(out);
}

function setFmt(ws: XLSX.WorkSheet, r: number, c: number, z: string): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (cell && cell.v !== "" && cell.v != null) cell.z = z;
}

function buildSummarySheet(rows: TaskRow[], meta: LabelInput): XLSX.WorkSheet {
  const { t } = meta;
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();
  for (const r of rows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + 1);
  }

  const aoa: (string | number)[][] = [];
  aoa.push([meta.tenantName]);
  aoa.push([t("reports.title")]);
  aoa.push([]);
  aoa.push([t("reports.kpi.total"), rows.length]);
  aoa.push([]);
  aoa.push([t("task.status")]);
  for (const s of ["Todo", "InProgress", "Done", "Archived"]) {
    if (byStatus.has(s)) aoa.push([statusLabel(t, s), byStatus.get(s)!]);
  }
  aoa.push([]);
  aoa.push([t("task.priority")]);
  for (const p of ["Critical", "High", "Medium", "Low"]) {
    if (byPriority.has(p)) aoa.push([priorityLabel(t, p), byPriority.get(p)!]);
  }

  // Applied filters, if any.
  const active = describeFilters(meta);
  if (active.length) {
    aoa.push([]);
    aoa.push([t("common.filters")]);
    for (const [k, v] of active) aoa.push([k, v]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 22 }, { wch: 22 }];
  return ws;
}

function describeFilters(meta: LabelInput): Array<[string, string]> {
  const { t, filters } = meta;
  const out: Array<[string, string]> = [];
  if (filters.status) out.push([t("task.status"), statusLabel(t, filters.status)]);
  if (filters.priority) out.push([t("task.priority"), priorityLabel(t, filters.priority)]);
  if (filters.search) out.push([t("common.search"), filters.search]);
  if (meta.groupBy !== "none") {
    const gk: Record<string, TKey> = {
      status: "task.status",
      priority: "task.priority",
      project: "task.project",
      assignee: "task.assignee",
    };
    out.push([t("export.groupBy"), t(gk[meta.groupBy])]);
  }
  return out;
}
