import "server-only";
import type { Locale } from "@/lib/enums";
import { Pdf, loadLogo, MUTED, LINE, INK, ZEBRA, type RGB } from "./pdf-core";
import type { KanbanData } from "./data";
import { fmtDate } from "./util";

export type KanbanPdfInput = {
  data: KanbanData;
  locale: Locale;
  tenantName: string;
  tenantLogo: string | null;
  accent: RGB | null;
  now: Date;
};

const PRIORITY_COLOR: Record<string, RGB> = {
  Critical: [220, 38, 38],
  High: [234, 88, 12],
  Medium: [202, 138, 4],
  Low: [22, 163, 74],
};

const COL_GAP = 10;
const CARD_H = 40;
const CARD_GAP = 6;
const MIN_COL_W = 150;

/** Kanban board snapshot PDF (landscape) — columns with card tiles. */
export async function buildKanbanPdf(input: KanbanPdfInput): Promise<Buffer> {
  const { data, locale, now } = input;
  const pdf = new Pdf({ locale, orientation: "landscape", accent: input.accent ?? undefined });
  const t = pdf.t;
  const doc = pdf.doc;
  const logo = input.tenantLogo ? await loadLogo(input.tenantLogo) : null;

  pdf.header(
    t("export.kind.kanban-pdf"),
    data.projectName ?? t("board.allProjects"),
    logo,
    fmtDate(locale, now)
  );

  const topY = pdf.y;
  const bottomY = pdf.H - pdf.margin - 24;
  const colAreaH = bottomY - topY;

  // How many columns fit per page.
  const maxPerPage = Math.max(1, Math.floor((pdf.contentW + COL_GAP) / (MIN_COL_W + COL_GAP)));
  const colsPerPage = Math.min(data.columns.length || 1, maxPerPage);
  const pages = chunk(data.columns, colsPerPage);

  pages.forEach((pageCols, pageIdx) => {
    if (pageIdx > 0) {
      doc.addPage();
      pdf.y = pdf.margin;
      pdf.header(t("export.kind.kanban-pdf"), data.projectName ?? t("board.allProjects"), logo, fmtDate(locale, now));
    }
    const n = pageCols.length;
    const colW = (pdf.contentW - COL_GAP * (n - 1)) / n;
    const maxCards = Math.max(1, Math.floor((colAreaH - 26) / (CARD_H + CARD_GAP)));

    pageCols.forEach((col, i) => {
      const vi = pdf.rtl ? n - 1 - i : i;
      const x = pdf.margin + vi * (colW + COL_GAP);

      // Column header pill.
      doc.setFillColor(pdf.accent[0], pdf.accent[1], pdf.accent[2]);
      doc.roundedRect(x, topY, colW, 20, 4, 4, "F");
      pdf.line(`${col.title}`, topY + 14, {
        align: "start",
        bold: true,
        size: 9.5,
        color: [255, 255, 255],
        x: pdf.rtl ? x + colW - 8 : x + 8,
      });
      pdf.line(String(col.tasks.length), topY + 14, {
        align: "end",
        size: 9,
        color: [255, 255, 255],
        x: pdf.rtl ? x + 8 : x + colW - 8,
      });

      // Column background lane.
      doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.roundedRect(x, topY + 24, colW, colAreaH - 24, 4, 4, "FD");

      let cy = topY + 24 + CARD_GAP;
      const shown = col.tasks.slice(0, maxCards);
      for (const card of shown) {
        drawCard(pdf, x + 6, cy, colW - 12, card);
        cy += CARD_H + CARD_GAP;
      }
      const overflow = col.tasks.length - shown.length;
      if (overflow > 0) {
        pdf.line(t("export.kanban.more", { n: overflow }), cy + 10, {
          align: "center",
          size: 8,
          color: MUTED,
          x: x + colW / 2,
        });
      }
    });
  });

  return pdf.finalize(input.tenantName);
}

function drawCard(
  pdf: Pdf,
  x: number,
  y: number,
  w: number,
  card: { title: string; assigneeName: string | null; priority: string; storyPoints: number | null }
): void {
  const doc = pdf.doc;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.roundedRect(x, y, w, CARD_H, 3, 3, "FD");

  // priority stripe on the leading edge
  const pc = PRIORITY_COLOR[card.priority] ?? MUTED;
  doc.setFillColor(pc[0], pc[1], pc[2]);
  const stripeX = pdf.rtl ? x + w - 3 : x;
  doc.rect(stripeX, y, 3, CARD_H, "F");

  const pad = 8;
  const innerRight = x + w - pad;
  const innerLeft = x + pad;
  const startX = pdf.rtl ? innerRight : innerLeft;

  pdf.line(pdf.truncate(card.title, w - pad * 2), y + 15, { align: "start", size: 8.5, color: INK, x: startX });
  const meta = [card.assigneeName ?? pdf.t("task.unassigned"), card.storyPoints != null ? `${card.storyPoints} ${pdf.t("task.storyPoints")}` : ""]
    .filter(Boolean)
    .join(" · ");
  pdf.line(pdf.truncate(meta, w - pad * 2), y + 30, { align: "start", size: 7.5, color: MUTED, x: startX });
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
