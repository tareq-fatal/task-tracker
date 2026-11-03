// TOF-0839 Projekt-Wissen — reine Hilfsfunktionen (ohne DB), damit sie in vitest laufen.

export const WISSEN_ARTEN = ["stand", "regeln", "adressen", "seite"] as const;
export type WissenArt = (typeof WISSEN_ARTEN)[number];

/** Obergrenze je Seite (wie der alte Kontext). */
export const WISSEN_MAX_ZEICHEN = 50_000;
export const WISSEN_MAX_TITEL = 160;
export const ENTSCHEIDUNG_MAX_ZEICHEN = 4_000;
/** Zielgröße der Sitzungsstart-Zusammenfassung (projekt_kontext). */
export const KONTEXT_ZIEL_ZEICHEN = 6_000;

export const ART_TITEL: Record<WissenArt, string> = {
  stand: "Stand",
  regeln: "Regeln",
  adressen: "Adressen",
  seite: "Seiten",
};

export function istWissenArt(v: unknown): v is WissenArt {
  return typeof v === "string" && (WISSEN_ARTEN as readonly string[]).includes(v);
}

/** URL-taugliche Kennung: klein, ASCII, Bindestriche. „Über uns & Ziele“ → „ueber-uns-ziele“. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

/** TOF-Nummern im Text, normalisiert und eindeutig: „tof-839“ zählt nicht, nur TOF-XXXX. */
export function tofVerweise(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\bTOF-(\d{4})\b/g)) out.add(`TOF-${m[1]}`);
  return [...out].sort();
}

/** Wiki-Verweise [[slug]] oder [[slug|Text]] auf andere Seiten im selben Projekt. */
export function seitenVerweise(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\]|\n]{1,80})(?:\|[^\]\n]*)?\]\]/g)) {
    const s = slugify(m[1]);
    if (s) out.add(s);
  }
  return [...out].sort();
}

/** Zeilenenden vereinheitlichen, Zeilenend-Leerzeichen bleiben (Markdown-Zeilenumbruch). */
export function normalisiere(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * „anhang“: einen Abschnitt unten anfügen. Mit Überschrift, wenn keine mitgegeben ist,
 * bekommt der Abschnitt ein Datum — damit spätere Sitzungen sehen, wann er dazukam.
 */
export function haengeAn(alt: string, anhang: string, datum = new Date()): string {
  const a = normalisiere(anhang).trim();
  if (!a) return alt;
  const block = /^#{1,6}\s/.test(a) ? a : `### ${datum.toISOString().slice(0, 10)}\n\n${a}`;
  const basis = normalisiere(alt).replace(/\s+$/, "");
  return basis ? `${basis}\n\n${block}\n` : `${block}\n`;
}

export type DiffZeile = { typ: "gleich" | "neu" | "weg"; text: string };

/** Zeilen-Diff (LCS). Für Seiten bis ~2000 Zeilen genug; größere werden grob verglichen. */
export function zeilenDiff(alt: string, neu: string): DiffZeile[] {
  const a = normalisiere(alt).split("\n");
  const b = normalisiere(neu).split("\n");
  if (a.length * b.length > 4_000_000) {
    return [...a.map((text) => ({ typ: "weg" as const, text })), ...b.map((text) => ({ typ: "neu" as const, text }))];
  }
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffZeile[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ typ: "gleich", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ typ: "weg", text: a[i++] });
    } else {
      out.push({ typ: "neu", text: b[j++] });
    }
  }
  while (i < n) out.push({ typ: "weg", text: a[i++] });
  while (j < m) out.push({ typ: "neu", text: b[j++] });
  return out;
}

/** Abschnitt „## Name“ (Ebene 1–3) aus Markdown holen, ohne die Überschrift; null = nicht da. */
export function abschnitt(md: string, namen: string[]): string | null {
  const zeilen = normalisiere(md).split("\n");
  const ziel = namen.map((n) => n.toLowerCase());
  for (let i = 0; i < zeilen.length; i++) {
    const h = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(zeilen[i]);
    if (!h || !ziel.some((n) => h[2].toLowerCase().startsWith(n))) continue;
    const ebene = h[1].length;
    const rest: string[] = [];
    for (let k = i + 1; k < zeilen.length; k++) {
      const h2 = /^(#{1,6})\s/.exec(zeilen[k]);
      if (h2 && h2[1].length <= ebene) break;
      rest.push(zeilen[k]);
    }
    const t = rest.join("\n").trim();
    return t || null;
  }
  return null;
}

/** Auf n Zeichen kürzen, an einer Zeilen- oder Wortgrenze, mit Hinweis. */
export function kuerze(text: string, n: number): string {
  if (text.length <= n) return text;
  const schnitt = text.slice(0, n);
  const grenze = Math.max(schnitt.lastIndexOf("\n"), schnitt.lastIndexOf(" "));
  return `${schnitt.slice(0, grenze > n * 0.6 ? grenze : n).trimEnd()} …`;
}

/** YAML-Wert sicher in doppelten Anführungszeichen. */
function yaml(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

export type ExportSeite = {
  slug: string;
  titel: string;
  art: string;
  angepinnt: boolean;
  inhalt: string;
  aktualisiertAm: Date;
  aktualisiertVon: string | null;
};

export type ExportEntscheidung = {
  id: string;
  datum: Date;
  wer: string;
  was: string;
  warum: string;
  aufgaben: string[];
  korrigiertId: string | null;
};

/** Eine Seite als .md mit YAML-Front-Matter (titel, art, aktualisiert, aufgaben). */
export function seiteAlsMarkdown(s: ExportSeite): string {
  const aufgaben = tofVerweise(s.inhalt);
  return [
    "---",
    `titel: ${yaml(s.titel)}`,
    `slug: ${s.slug}`,
    `art: ${s.art}`,
    `angepinnt: ${s.angepinnt}`,
    `aktualisiert: ${s.aktualisiertAm.toISOString()}`,
    ...(s.aktualisiertVon ? [`von: ${yaml(s.aktualisiertVon)}`] : []),
    `aufgaben: [${aufgaben.map(yaml).join(", ")}]`,
    "---",
    "",
    normalisiere(s.inhalt).trimEnd(),
    "",
  ].join("\n");
}

function zelle(v: string): string {
  return normalisiere(v).replace(/\|/g, "\\|").replace(/\n+/g, " <br> ");
}

export function entscheidungenAlsMarkdown(projekt: string, liste: ExportEntscheidung[]): string {
  const kopf = [`# Entscheidungen — ${projekt}`, "", "| Datum | Wer | Was | Warum | Aufgaben |", "| --- | --- | --- | --- | --- |"];
  const zeilen = liste.map((e) => {
    const was = e.korrigiertId ? `${e.was} (korrigiert ${e.korrigiertId})` : e.was;
    return `| ${e.datum.toISOString().slice(0, 10)} | ${zelle(e.wer)} | ${zelle(was)} | ${zelle(e.warum)} | ${e.aufgaben.join(", ")} |`;
  });
  return [...kopf, ...(zeilen.length ? zeilen : ["| – | – | (noch keine) | – | – |"]), ""].join("\n");
}

export function exportReadme(projekt: { id: string; name: string }, seiten: ExportSeite[], basis: string, stand = new Date()): string {
  const gruppen = WISSEN_ARTEN.map((art) => {
    const s = seiten.filter((x) => x.art === art);
    if (s.length === 0) return "";
    return [`## ${ART_TITEL[art]}`, "", ...s.map((x) => `- [${x.titel}](${x.slug}.md)${x.angepinnt ? " (angepinnt)" : ""}`), ""].join("\n");
  }).filter(Boolean);
  return [
    `# Projekt-Wissen — ${projekt.name}`,
    "",
    `Export vom ${stand.toISOString().slice(0, 16).replace("T", " ")} UTC. Quelle: ${basis}/projects/${projekt.id}/wissen`,
    "",
    "Für KI-Sitzungen: zuerst die angepinnten Seiten lesen, dann ENTSCHEIDUNGEN.md.",
    "",
    ...gruppen,
    "- [Entscheidungen](ENTSCHEIDUNGEN.md)",
    "",
  ].join("\n");
}

/** Ordnername im Tenant-Export: lesbar und eindeutig. */
export function projektOrdner(p: { id: string; name: string }): string {
  return `${slugify(p.name) || "projekt"}-${p.id.slice(-6)}`;
}
