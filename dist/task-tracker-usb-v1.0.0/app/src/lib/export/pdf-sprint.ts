import "server-only";
import type { Locale } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";
import { Pdf, loadLogo, hexToRgb, type RGB } from "./pdf-core";
import { sprintBurndown } from "@/lib/sprints";
import type { SprintReportData } from "./data";
import { fmtDate } from "./util";

export type SprintPdfInput = {
  data: NonNullable<SprintReportData>;
  locale: Locale;
  tenantName: string;
  tenantLogo: string | null;
  accent: RGB | null;
  now: Date;
};

/** Sprint report PDF: KPIs, burndown chart, velocity chart, task table. */
export async function buildSprintPdf(input: SprintPdfInput): Promise<Buffer> {
  const { data, locale, now } = input;
  const pdf = new Pdf({ locale, orientation: "portrait", accent: input.accent ?? hexToRgb(null) ?? undefined });
  const t = pdf.t;
  const logo = input.tenantLogo ? await loadLogo(input.tenantLogo) : null;

  const subtitle = [data.sprint.projectName, data.sprint.name].filter(Boolean).join(" · ");
  pdf.header(t("export.kind.sprint-pdf"), subtitle || null, logo, fmtDate(locale, now));

  // Goal + window line.
  if (data.sprint.goal) {
    pdf.line(`${t("sprint.goal")}: ${data.sprint.goal}`, pdf.y, { align: "start", size: 9.5 });
    pdf.y += 16;
  }
  const window = `${fmtDate(locale, data.sprint.startDate)} — ${fmtDate(locale, data.sprint.endDate)}`;
  pdf.line(window, pdf.y, { align: "start", size: 9, color: [107, 114, 128] });
  pdf.y += 16;

  // KPIs
  const total = data.tasks.length;
  const done = data.tasks.filter((x) => x.status === "Done").length;
  const points = data.tasks.reduce((a, x) => a + (x.storyPoints ?? 0), 0);
  const donePoints = data.tasks.filter((x) => x.status === "Done").reduce((a, x) => a + (x.storyPoints ?? 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  pdf.kpiCards([
    { label: t("sprint.total"), value: String(total) },
    { label: t("sprint.completed"), value: String(done) },
    { label: t("task.storyPoints"), value: `${donePoints}/${points}` },
    { label: t("infographic.completionRate"), value: `${pct}%` },
  ]);

  // Burndown
  if (data.sprint.startDate && data.sprint.endDate) {
    pdf.section(t("sprint.burndown"));
    const bd = sprintBurndown(
      data.tasks.map((x) => ({ completedAt: x.completedAt })),
      data.sprint.startDate,
      data.sprint.endDate,
      now
    );
    pdf.lineChart(bd.map((p) => ({ label: p.date.slice(5), a: p.remaining, b: p.ideal })));
  }

  // Velocity
  if (data.velocity.length > 0) {
    pdf.section(t("sprint.velocity"));
    pdf.barChart(
      data.velocity.slice(-8).map((v) => ({ label: v.name, value: v.completed, second: v.total })),
      { height: 120 }
    );
  }

  // Task table
  pdf.section(t("nav.admin.tasks"));
  const rows = data.tasks.map((x) => [
    x.title,
    t(`status.${x.status}` as TKey),
    x.assigneeName ?? t("task.unassigned"),
    x.storyPoints != null ? String(x.storyPoints) : "—",
  ]);
  pdf.table(
    [
      { header: t("task.title"), w: 6, align: "start" },
      { header: t("task.status"), w: 2, align: "start" },
      { header: t("task.assignee"), w: 3, align: "start" },
      { header: t("task.storyPoints"), w: 1.4, align: "center" },
    ],
    rows
  );

  return pdf.finalize(input.tenantName);
}
