import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveUploadPath } from "@/lib/upload-paths";
import { jsPDF } from "jspdf";
import type { Locale } from "@/lib/enums";
import { shapeForLocale } from "./arabic";
import { makeExportT, type ExportT } from "./i18n-export";
import { AMIRI_REGULAR_BASE64 } from "./assets/amiri-font";

export type RGB = [number, number, number];

// Palette — kept close to the app's indigo/pink brand.
export const INK: RGB = [31, 41, 55]; // slate-800
export const MUTED: RGB = [107, 114, 128]; // slate-500
export const LINE: RGB = [226, 232, 240]; // slate-200
export const ZEBRA: RGB = [247, 248, 250];
export const BRAND: RGB = [99, 102, 241]; // indigo-500

const AMIRI = "Amiri";

/** Parse a #rrggbb (or #rgb) hex colour to RGB, or null if unparseable. */
export function hexToRgb(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export type PdfOptions = {
  locale: Locale;
  orientation?: "portrait" | "landscape";
  accent?: RGB; // tenant primary colour, defaults to BRAND
};

/**
 * Thin wrapper around jsPDF that handles the two things jsPDF can't do on its
 * own for this app: Arabic shaping (via the embedded Amiri font + reshaper) and
 * RTL-aware layout. All drawing goes through here so locale handling is uniform.
 */
export class Pdf {
  readonly doc: jsPDF;
  readonly locale: Locale;
  readonly t: ExportT;
  readonly rtl: boolean;
  readonly accent: RGB;
  readonly W: number;
  readonly H: number;
  readonly margin = 40;
  y: number;

  constructor(opts: PdfOptions) {
    this.doc = new jsPDF({ orientation: opts.orientation ?? "portrait", unit: "pt", format: "a4" });
    this.locale = opts.locale;
    this.t = makeExportT(opts.locale);
    this.rtl = opts.locale === "ar";
    this.accent = opts.accent ?? BRAND;
    this.W = this.doc.internal.pageSize.getWidth();
    this.H = this.doc.internal.pageSize.getHeight();
    this.y = this.margin;

    // Register the Arabic-capable font. Latin locales use jsPDF's built-in
    // Helvetica (which covers German umlauts); Arabic uses Amiri for its glyphs.
    this.doc.addFileToVFS("Amiri-Regular.ttf", AMIRI_REGULAR_BASE64);
    this.doc.addFont("Amiri-Regular.ttf", AMIRI, "normal");
  }

  /** The x coordinate where the content area starts on the "leading" side. */
  get leadX(): number {
    return this.rtl ? this.W - this.margin : this.margin;
  }
  get contentW(): number {
    return this.W - this.margin * 2;
  }

  setFont(bold = false, size = 10): this {
    // Amiri ships regular only; emulate bold with a slightly larger size for AR.
    if (this.rtl) this.doc.setFont(AMIRI, "normal");
    else this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    return this;
  }

  setColor(c: RGB): this {
    this.doc.setTextColor(c[0], c[1], c[2]);
    return this;
  }

  /** Shape text for the current locale before any measurement or drawing. */
  shape(text: string): string {
    return shapeForLocale(text ?? "", this.locale);
  }

  width(text: string): number {
    return this.doc.getTextWidth(this.shape(text));
  }

  /**
   * Draw a single line. `align` is logical: "start" hugs the reading edge
   * (right in RTL, left in LTR), "end" the opposite, "center" centres.
   */
  line(
    text: string,
    y: number,
    o: { align?: "start" | "end" | "center"; bold?: boolean; size?: number; color?: RGB; x?: number } = {}
  ): void {
    this.setFont(o.bold, o.size ?? 10).setColor(o.color ?? INK);
    const align = o.align ?? "start";
    const shaped = this.shape(text);
    let x: number;
    let jsAlign: "left" | "right" | "center";
    if (align === "center") {
      x = o.x ?? this.W / 2;
      jsAlign = "center";
    } else {
      const atStart = align === "start";
      const rightSide = this.rtl ? atStart : !atStart;
      x = o.x ?? (rightSide ? this.W - this.margin : this.margin);
      jsAlign = rightSide ? "right" : "left";
    }
    this.doc.text(shaped, x, y, { align: jsAlign });
  }

  /** Truncate text with an ellipsis to fit `maxW` points. */
  truncate(text: string, maxW: number): string {
    if (this.width(text) <= maxW) return text;
    let s = text;
    while (s.length > 1 && this.doc.getTextWidth(this.shape(s + "…")) > maxW) {
      s = s.slice(0, -1);
    }
    return s + "…";
  }

  hr(y: number, color: RGB = LINE): void {
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, y, this.W - this.margin, y);
  }

  /** Ensure `need` points remain on the page; add a page and reset y otherwise. */
  ensure(need: number): void {
    if (this.y + need > this.H - this.margin - 20) {
      this.doc.addPage();
      this.y = this.margin;
    }
  }

  /** Page header: optional logo, title, subtitle, right-aligned date. */
  header(title: string, subtitle: string | null, logo: LogoImage | null, dateLabel: string): void {
    const top = this.margin;
    let textLeftEdge = this.margin;
    let textRightEdge = this.W - this.margin;

    if (logo) {
      const h = 34;
      const w = Math.min(120, (logo.w / logo.h) * h);
      // Logo sits on the leading edge.
      const lx = this.rtl ? this.W - this.margin - w : this.margin;
      this.doc.addImage(logo.dataUrl, logo.format, lx, top, w, h);
      if (this.rtl) textRightEdge -= w + 12;
      else textLeftEdge += w + 12;
    }

    this.setFont(true, 17).setColor(INK);
    this.line(title, top + 16, { align: "start", bold: true, size: 17, x: this.rtl ? textRightEdge : textLeftEdge });
    if (subtitle) {
      this.line(subtitle, top + 32, { align: "start", size: 9.5, color: MUTED, x: this.rtl ? textRightEdge : textLeftEdge });
    }
    // Date on the trailing edge.
    this.line(dateLabel, top + 16, { align: "end", size: 9, color: MUTED });

    this.y = top + 48;
    this.hr(this.y, this.accent);
    this.y += 18;
  }

  /** A row of stat cards. Each card: { label, value }. */
  kpiCards(cards: Array<{ label: string; value: string }>, opts: { perRow?: number } = {}): void {
    const perRow = opts.perRow ?? Math.min(cards.length, 4);
    const gap = 10;
    const cardW = (this.contentW - gap * (perRow - 1)) / perRow;
    const cardH = 48;
    for (let i = 0; i < cards.length; i++) {
      const col = i % perRow;
      if (col === 0) {
        this.ensure(cardH + 12);
      }
      const rowStart = i - col;
      const yTop = this.y;
      // In RTL, first card hugs the right edge.
      const offset = col * (cardW + gap);
      const x = this.rtl ? this.W - this.margin - cardW - offset : this.margin + offset;
      this.doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
      this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      this.doc.roundedRect(x, yTop, cardW, cardH, 6, 6, "FD");
      const pad = 10;
      const innerRight = x + cardW - pad;
      const innerLeft = x + pad;
      this.line(cards[i].label, yTop + 16, {
        align: "start",
        size: 8,
        color: MUTED,
        x: this.rtl ? innerRight : innerLeft,
      });
      this.line(cards[i].value, yTop + 36, {
        align: "start",
        bold: true,
        size: 18,
        color: this.accent,
        x: this.rtl ? innerRight : innerLeft,
      });
      const isLastInRow = col === perRow - 1 || i === cards.length - 1;
      if (isLastInRow) this.y = yTop + cardH + 12;
      void rowStart;
    }
  }

  /** Section heading with a small accent bar. */
  section(title: string): void {
    this.ensure(30);
    this.y += 6;
    const barW = 3;
    const barX = this.rtl ? this.W - this.margin - barW : this.margin;
    this.doc.setFillColor(this.accent[0], this.accent[1], this.accent[2]);
    this.doc.rect(barX, this.y - 9, barW, 12, "F");
    this.line(title, this.y, {
      align: "start",
      bold: true,
      size: 12,
      x: this.rtl ? this.W - this.margin - barW - 6 : this.margin + barW + 6,
    });
    this.y += 14;
  }

  /**
   * Table with a coloured header row, zebra striping, RTL column order, and
   * automatic page breaks. `cols[i].w` is a weight; widths are normalised to the
   * content area. `align` per column is logical ("start"/"end"/"center").
   */
  table(
    cols: Array<{ header: string; w: number; align?: "start" | "end" | "center" }>,
    rows: string[][]
  ): void {
    const totalW = cols.reduce((a, c) => a + c.w, 0);
    const widths = cols.map((c) => (c.w / totalW) * this.contentW);
    const rowH = 18;
    const pad = 5;

    // Column x-origin (left edge of each cell), laid out RTL or LTR.
    const xLeft: number[] = [];
    {
      let acc = 0;
      for (let i = 0; i < cols.length; i++) {
        xLeft.push(this.margin + acc);
        acc += widths[i];
      }
    }
    // Visual column index → data column index (reverse for RTL).
    const order = this.rtl ? cols.map((_, i) => cols.length - 1 - i) : cols.map((_, i) => i);

    const drawHeader = () => {
      this.doc.setFillColor(this.accent[0], this.accent[1], this.accent[2]);
      this.doc.rect(this.margin, this.y, this.contentW, rowH, "F");
      for (let vi = 0; vi < cols.length; vi++) {
        const di = order[vi];
        const cx = xLeft[vi];
        const w = widths[vi];
        const col = cols[di];
        this.cellText(col.header, cx, this.y, w, pad, rowH, col.align ?? "start", true, [255, 255, 255], 9);
      }
      this.y += rowH;
    };

    this.ensure(rowH * 2);
    drawHeader();

    for (let r = 0; r < rows.length; r++) {
      if (this.y + rowH > this.H - this.margin - 20) {
        this.doc.addPage();
        this.y = this.margin;
        drawHeader();
      }
      if (r % 2 === 1) {
        this.doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
        this.doc.rect(this.margin, this.y, this.contentW, rowH, "F");
      }
      for (let vi = 0; vi < cols.length; vi++) {
        const di = order[vi];
        const cx = xLeft[vi];
        const w = widths[vi];
        const col = cols[di];
        this.cellText(rows[r][di] ?? "", cx, this.y, w, pad, rowH, col.align ?? "start", false, INK, 9);
      }
      this.y += rowH;
    }
    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.5);
    this.doc.rect(this.margin, this.y - rows.length * rowH - rowH, this.contentW, (rows.length + 1) * rowH);
  }

  private cellText(
    text: string,
    cellX: number,
    cellY: number,
    cellW: number,
    pad: number,
    rowH: number,
    align: "start" | "end" | "center",
    bold: boolean,
    color: RGB,
    size: number
  ): void {
    this.setFont(bold, size).setColor(color);
    const baseline = cellY + rowH - 6;
    const maxW = cellW - pad * 2;
    const shown = this.truncate(text, maxW);
    const shaped = this.shape(shown);
    let x: number;
    let jsAlign: "left" | "right" | "center";
    if (align === "center") {
      x = cellX + cellW / 2;
      jsAlign = "center";
    } else {
      const atStart = align === "start";
      const rightSide = this.rtl ? atStart : !atStart;
      x = rightSide ? cellX + cellW - pad : cellX + pad;
      jsAlign = rightSide ? "right" : "left";
    }
    this.doc.text(shaped, x, baseline, { align: jsAlign });
  }

  /** Vertical bar chart (e.g. sprint velocity). */
  barChart(data: Array<{ label: string; value: number; second?: number }>, opts: { height?: number; legend?: [string, string] } = {}): void {
    const h = opts.height ?? 130;
    this.ensure(h + 40);
    const x0 = this.margin;
    const y0 = this.y;
    const chartW = this.contentW;
    const maxVal = Math.max(1, ...data.map((d) => Math.max(d.value, d.second ?? 0)));
    const n = data.length || 1;
    const slot = chartW / n;
    const barW = Math.min(28, slot * 0.5);
    const axisY = y0 + h;

    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.5);
    this.doc.line(x0, axisY, x0 + chartW, axisY);

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const vi = this.rtl ? data.length - 1 - i : i;
      const cx = x0 + slot * vi + slot / 2;
      // total (light) then completed (accent) overlay
      if (d.second != null) {
        const bh2 = (d.second / maxVal) * (h - 10);
        this.doc.setFillColor(LINE[0], LINE[1], LINE[2]);
        this.doc.rect(cx - barW / 2, axisY - bh2, barW, bh2, "F");
      }
      const bh = (d.value / maxVal) * (h - 10);
      this.doc.setFillColor(this.accent[0], this.accent[1], this.accent[2]);
      this.doc.rect(cx - barW / 2, axisY - bh, barW, bh, "F");
      this.line(String(d.value), axisY - bh - 3, { align: "center", size: 7, color: MUTED, x: cx });
      this.line(this.truncate(d.label, slot), axisY + 10, { align: "center", size: 7, color: MUTED, x: cx });
    }
    this.y = axisY + 22;
  }

  /** Line chart with an optional dashed "ideal" reference series (burndown). */
  lineChart(
    points: Array<{ label: string; a: number | null; b?: number | null }>,
    opts: { height?: number } = {}
  ): void {
    const h = opts.height ?? 130;
    this.ensure(h + 40);
    const x0 = this.margin;
    const y0 = this.y;
    const chartW = this.contentW;
    const vals: number[] = [];
    for (const p of points) {
      if (p.a != null) vals.push(p.a);
      if (p.b != null) vals.push(p.b);
    }
    const maxVal = Math.max(1, ...vals);
    const axisY = y0 + h;
    const n = Math.max(1, points.length - 1);
    const xAt = (i: number) => {
      const t = i / n;
      const tt = this.rtl ? 1 - t : t;
      return x0 + tt * chartW;
    };
    const yAt = (v: number) => axisY - (v / maxVal) * (h - 10);

    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.5);
    this.doc.line(x0, axisY, x0 + chartW, axisY);

    // ideal (dashed grey)
    if (points.some((p) => p.b != null)) {
      this.doc.setDrawColor(180, 185, 195);
      this.doc.setLineWidth(1);
      this.dashLine(points.map((p, i) => [xAt(i), yAt(p.b ?? 0)] as [number, number]));
    }
    // actual (accent solid)
    this.doc.setDrawColor(this.accent[0], this.accent[1], this.accent[2]);
    this.doc.setLineWidth(1.5);
    const solid = points.map((p, i) => (p.a != null ? ([xAt(i), yAt(p.a)] as [number, number]) : null));
    let prev: [number, number] | null = null;
    for (const pt of solid) {
      if (pt && prev) this.doc.line(prev[0], prev[1], pt[0], pt[1]);
      if (pt) prev = pt;
    }
    // endpoint labels
    const first = points[0];
    const last = points[points.length - 1];
    if (first && first.a != null) this.line(String(first.a), yAt(first.a) - 4, { align: "center", size: 7, color: MUTED, x: xAt(0) });
    void last;
    this.y = axisY + 22;
  }

  private dashLine(pts: Array<[number, number]>): void {
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const segs = 6;
      for (let s = 0; s < segs; s += 2) {
        const t1 = s / segs, t2 = Math.min(1, (s + 1) / segs);
        this.doc.line(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1, x1 + (x2 - x1) * t2, y1 + (y2 - y1) * t2);
      }
    }
  }

  /** Horizontal labelled bars for a distribution (status/priority counts). */
  hBars(data: Array<{ label: string; value: number; color?: RGB }>): void {
    const maxVal = Math.max(1, ...data.map((d) => d.value));
    const rowH = 20;
    const labelW = 110;
    const barMaxW = this.contentW - labelW - 46;
    for (const d of data) {
      this.ensure(rowH);
      const yMid = this.y + rowH / 2 + 2;
      const labelX = this.rtl ? this.W - this.margin : this.margin;
      this.line(this.truncate(d.label, labelW - 6), yMid, { align: "start", size: 9, color: INK, x: labelX });
      const w = (d.value / maxVal) * barMaxW;
      const barX = this.rtl ? this.W - this.margin - labelW - w : this.margin + labelW;
      const c = d.color ?? this.accent;
      this.doc.setFillColor(c[0], c[1], c[2]);
      this.doc.roundedRect(barX, this.y + 3, Math.max(1, w), rowH - 8, 2, 2, "F");
      const valX = this.rtl ? barX - 6 : barX + w + 6;
      this.line(String(d.value), yMid, { align: this.rtl ? "end" : "start", size: 9, color: MUTED, x: valX });
      this.y += rowH;
    }
    this.y += 6;
  }

  /** Draw footers (page x/y + generated-by) on every page, then return bytes. */
  finalize(footerNote: string): Buffer {
    const pages = this.doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      this.doc.setPage(p);
      const fy = this.H - this.margin + 14;
      this.hr(this.H - this.margin + 2, LINE);
      this.setFont(false, 8).setColor(MUTED);
      const pageLabel = this.t("export.pdf.page", { n: p, total: pages });
      // note on leading edge, page number on trailing edge
      this.line(footerNote, fy, { align: "start", size: 8, color: MUTED });
      this.line(pageLabel, fy, { align: "end", size: 8, color: MUTED });
    }
    const ab = this.doc.output("arraybuffer");
    return Buffer.from(ab);
  }
}

export type LogoImage = { dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number };

/**
 * Read a tenant logo from the public uploads dir and return it as a data URL
 * plus intrinsic size (for aspect-correct placement). Returns null for missing
 * files or unsupported formats (jsPDF handles PNG/JPEG only, not SVG).
 */
export async function loadLogo(logoPublicPath: string | null | undefined): Promise<LogoImage | null> {
  if (!logoPublicPath) return null;
  const clean = logoPublicPath.split("?")[0].replace(/^\/+/, "");
  const ext = clean.split(".").pop()?.toLowerCase();
  const format: "PNG" | "JPEG" | null =
    ext === "png" ? "PNG" : ext === "jpg" || ext === "jpeg" ? "JPEG" : null;
  if (!format) return null; // svg/webp unsupported by jsPDF addImage
  try {
    const abs = resolveUploadPath(clean);
    if (!abs) return null;
    const bytes = await readFile(abs);
    const dataUrl = `data:image/${format === "PNG" ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
    const { w, h } = imageSize(bytes, format);
    return { dataUrl, format, w, h };
  } catch {
    return null;
  }
}

/** Minimal intrinsic-size reader for PNG (IHDR) and JPEG (SOFn). */
function imageSize(buf: Buffer, format: "PNG" | "JPEG"): { w: number; h: number } {
  try {
    if (format === "PNG") {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // JPEG: scan for a Start-Of-Frame marker.
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = buf[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  } catch {
    /* fall through */
  }
  return { w: 120, h: 40 };
}
