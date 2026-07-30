import "server-only";
import type { Locale } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";
import { Pdf, loadLogo, type RGB } from "./pdf-core";
import type { ActivityReportData } from "./data";
import { fmtDate, fmtDateTime } from "./util";

export type ActivityPdfInput = {
  data: NonNullable<ActivityReportData>;
  locale: Locale;
  tenantName: string;
  tenantLogo: string | null;
  accent: RGB | null;
  now: Date;
};

// Map an activity type to an existing i18n key ("activity.<type>").
function activityLabel(t: (k: TKey, v?: Record<string, string | number>) => string, type: string): string {
  const key = `activity.${type}` as TKey;
  const label = t(key);
  return label === key ? type : label;
}

/** User-activity report PDF: totals, activity-by-type, daily trend, recent log. */
export async function buildActivityPdf(input: ActivityPdfInput): Promise<Buffer> {
  const { data, locale, now } = input;
  const pdf = new Pdf({ locale, orientation: "portrait", accent: input.accent ?? undefined });
  const t = pdf.t;
  const logo = input.tenantLogo ? await loadLogo(input.tenantLogo) : null;

  pdf.header(
    t("export.kind.activity-pdf"),
    `${data.user.name} · ${t("perf.last30").replace("30", String(data.windowDays))}`,
    logo,
    fmtDate(locale, now)
  );

  // Totals
  pdf.kpiCards([
    { label: t("infographic.assigned"), value: String(data.totals.assigned) },
    { label: t("dashboard.createdByMe"), value: String(data.totals.created) },
    { label: t("reports.kpi.done"), value: String(data.totals.done) },
    { label: t("reports.kpi.open"), value: String(data.totals.open) },
    { label: t("reports.kpi.overdue"), value: String(data.totals.overdue) },
  ], { perRow: 5 });

  // Activity by type
  if (data.byType.length > 0) {
    pdf.section(t("adminActivity.title"));
    pdf.hBars(data.byType.slice(0, 8).map((x) => ({ label: activityLabel(t, x.type), value: x.count })));
  }

  // Daily trend (bar chart over the window; sample to keep bars legible)
  pdf.section(t("perf.productivity"));
  const per = data.perDay;
  const step = Math.max(1, Math.ceil(per.length / 30));
  const sampled: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < per.length; i += step) {
    const slice = per.slice(i, i + step);
    sampled.push({ label: per[i].date.slice(5), value: slice.reduce((a, d) => a + d.count, 0) });
  }
  pdf.barChart(sampled, { height: 110 });

  // Recent activity log
  if (data.recent.length > 0) {
    pdf.section(t("focus.recent"));
    const rows = data.recent.map((r) => [
      fmtDateTime(locale, r.createdAt),
      activityLabel(t, r.type),
      r.detail ?? "",
      r.taskTitle,
    ]);
    pdf.table(
      [
        { header: t("time.of"), w: 2.4, align: "start" },
        { header: t("adminActivity.title"), w: 2, align: "start" },
        { header: t("task.description"), w: 3, align: "start" },
        { header: t("task.title"), w: 4, align: "start" },
      ],
      rows
    );
  }

  return pdf.finalize(input.tenantName);
}
