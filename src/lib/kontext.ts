// „Kontext für Claude“ (Tarek 15.10.2026): je Projekt ein Markdown-Text mit Ziel, Stand,
// Entscheidungen, Systemen, Ansprechpartnern, Regeln und offenen Fragen — damit ein Agent
// (auch ein Cowork-Agent ohne Anmeldung) den Stand lesen kann. Reine Funktionen, ohne DB.
import { hasScope, type ApiScope } from "./api-token";
import { PRIORITY_SHORT, type TaskPriority } from "./enums";

export const KONTEXT_MAX_ZEICHEN = 50_000;

export const KONTEXT_VORLAGE = `## Ziel

## Stand

## Wichtige Entscheidungen

## Systeme, Links, Repos

## Ansprechpartner

## Regeln / No-Gos

## Offene Fragen

## Letzte Änderungen
`;

export type KontextAufgabe = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};

export type KontextProjekt = {
  id: string;
  name: string;
  description: string | null;
  kontext: string | null; // aktuelle Fassung, null = noch keine
  kontextStand: { am: Date; von: string } | null;
};

/** Ein Kontext-Token darf lesen; read/write dürfen es auch (sie sehen ohnehin mehr). */
export function darfKontextLesen(scopes: Set<ApiScope>): boolean {
  return scopes.has("kontext") || hasScope(scopes, "read");
}

/** Kommentieren: der eigene enge Scope oder ein voller Schreib-Token. */
export function darfKommentieren(scopes: Set<ApiScope>): boolean {
  return scopes.has("kommentar") || scopes.has("write");
}

const STATUS_WORT: Record<string, string> = { Todo: "offen", InProgress: "in Arbeit", Done: "erledigt", Archived: "archiviert" };
const PRIO_RANG: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function tag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function zeile(a: KontextAufgabe, basis: string): string {
  const p = PRIORITY_SHORT[a.priority as TaskPriority] ?? a.priority;
  const faellig = a.dueDate && a.status !== "Done" ? ` · fällig ${tag(a.dueDate)}` : "";
  const erledigt = a.status === "Done" && a.completedAt ? ` · erledigt ${tag(a.completedAt)}` : "";
  return `- [${STATUS_WORT[a.status] ?? a.status}] ${p} ${a.title.replace(/\s+/g, " ").trim()}${faellig}${erledigt} — ${basis}/tasks/${a.id}`;
}

/** Offene zuerst (in Arbeit vor offen, dann nach Priorität), danach die zuletzt erledigten. */
export function aufgabenListe(aufgaben: KontextAufgabe[], basis: string, erledigtMax = 10): string[] {
  const offen = aufgaben
    .filter((a) => a.status === "Todo" || a.status === "InProgress")
    .sort((x, y) =>
      (x.status === "InProgress" ? 0 : 1) - (y.status === "InProgress" ? 0 : 1) ||
      (PRIO_RANG[x.priority] ?? 9) - (PRIO_RANG[y.priority] ?? 9) ||
      +y.updatedAt - +x.updatedAt);
  const erledigt = aufgaben
    .filter((a) => a.status === "Done")
    .sort((x, y) => +(y.completedAt ?? y.updatedAt) - +(x.completedAt ?? x.updatedAt))
    .slice(0, erledigtMax);
  return [...offen, ...erledigt].map((a) => zeile(a, basis));
}

/** Volle Fassung für EIN Projekt: Kontext + Aufgabenliste. */
export function projektKontextMd(p: KontextProjekt, aufgaben: KontextAufgabe[], basis: string, jetzt: Date): string {
  const kopf = [
    `# ${p.name}`,
    "",
    `> Projekt ${basis}/projects/${p.id} · Stand ${jetzt.toISOString().slice(0, 16).replace("T", " ")} UTC` +
      (p.kontextStand ? ` · Kontext zuletzt geändert ${tag(p.kontextStand.am)} von ${p.kontextStand.von}` : " · noch kein Kontext gepflegt"),
    "",
  ];
  if (p.description) kopf.push(p.description.trim(), "");
  const offen = aufgaben.filter((a) => a.status === "Todo" || a.status === "InProgress").length;
  const erledigt = aufgaben.filter((a) => a.status === "Done").length;
  return [
    ...kopf,
    (p.kontext ?? "").trim() || "_(Kein Kontext hinterlegt.)_",
    "",
    `## Aufgaben (${offen} offen, ${erledigt} erledigt)`,
    "",
    ...(aufgabenListe(aufgaben, basis).length ? aufgabenListe(aufgaben, basis) : ["_(keine)_"]),
    "",
  ].join("\n");
}

/** Kompakt über alle Projekte: Kontext gekürzt auf die ersten Zeilen, nur offene Aufgaben gezählt + die wichtigsten. */
export function alleKontexteMd(
  projekte: { p: KontextProjekt; aufgaben: KontextAufgabe[] }[],
  basis: string,
  jetzt: Date,
  zeilenMax = 12,
  aufgabenMax = 5,
): string {
  const teile = [`# Projekte — Kontext für Claude`, "", `> ${basis} · Stand ${jetzt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${projekte.length} Projekte · voll je Projekt: ${basis}/api/projekte/<id>/kontext.md`, ""];
  for (const { p, aufgaben } of projekte) {
    const offen = aufgaben.filter((a) => a.status === "Todo" || a.status === "InProgress");
    const erledigt = aufgaben.filter((a) => a.status === "Done").length;
    // Überschriften aus dem Kontext eine Ebene unter den Projektnamen, sonst verschwimmen die Projektgrenzen.
    const kontextZeilen = (p.kontext ?? "").trim().split("\n").filter((z) => z.trim() !== "").map((z) => (/^#{1,5} /.test(z) ? "#" + z : z));
    teile.push(`## ${p.name}`, "", `${offen.length} offen · ${erledigt} erledigt · voll: ${basis}/api/projekte/${p.id}/kontext.md`, "");
    if (kontextZeilen.length) {
      teile.push(...kontextZeilen.slice(0, zeilenMax));
      if (kontextZeilen.length > zeilenMax) teile.push(`_… ${kontextZeilen.length - zeilenMax} weitere Zeilen in der vollen Fassung_`);
    } else {
      teile.push("_(Kein Kontext hinterlegt.)_");
    }
    const wichtig = aufgabenListe(offen, basis).slice(0, aufgabenMax);
    if (wichtig.length) teile.push("", "Wichtigste offene Aufgaben:", ...wichtig);
    teile.push("");
  }
  return teile.join("\n");
}
