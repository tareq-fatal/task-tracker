// Projektstand (Tarek 14.10.2026): „Diagramm, Projekt-Übersicht, um zu wissen, wo wir gerade
// stehen. Dynamisch, mit allen Projekten.“ Reine Rechnung über die sichtbaren Aufgaben —
// keine Konfiguration je Projekt, jedes Projekt erscheint, sobald es Aufgaben hat.

export type StandAufgabe = {
  id: string;
  title: string;
  status: string; // Todo | InProgress | Done | Archived
  priority: string; // Low | Medium | High | Critical
  dueDate: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  projectId: string | null;
};

export type StandProjekt = { id: string; name: string; color: string };

export type ProjektZeile = {
  id: string;
  name: string;
  color: string;
  erledigt: number;
  inArbeit: number;
  offen: number;
  gesamt: number;
  prozent: number; // erledigt / gesamt, gerundet
  prio: Record<"Critical" | "High" | "Medium" | "Low", number>; // nur nicht erledigte
  ueberfaellig: number;
  letzteAktivitaet: Date | null;
  erledigtImZeitraum: number;
};

export type Woche = { start: Date; label: string; count: number };

export type Projektstand = {
  gesamt: { erledigt: number; inArbeit: number; offen: number; gesamt: number; prozent: number; ueberfaellig: number; erledigtImZeitraum: number };
  projekte: ProjektZeile[];
  wochen: Woche[];
  inArbeit: StandAufgabe[];
  zuletztErledigt: StandAufgabe[];
};

export const ZEITRAEUME = [4, 12, 26, 52] as const; // Wochen
export const OHNE_PROJEKT = "ohne";

const TAG = 86_400_000;

/** Montag 00:00 UTC der Woche von d. */
export function wochenStart(d: Date): Date {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const wt = (new Date(t).getUTCDay() + 6) % 7; // Mo = 0
  return new Date(t - wt * TAG);
}

function istOffen(a: StandAufgabe) {
  return a.status !== "Done" && a.status !== "Archived";
}

export function berechneProjektstand(
  aufgaben: StandAufgabe[],
  projekte: StandProjekt[],
  jetzt: Date,
  wochenAnzahl: number,
  listeMax = 10,
): Projektstand {
  // Archivierte zählen nicht mit: sie sind weder Arbeit noch Ergebnis.
  const aktiv = aufgaben.filter((a) => a.status !== "Archived");
  const ersteWoche = new Date(wochenStart(jetzt).getTime() - (wochenAnzahl - 1) * 7 * TAG);
  const imZeitraum = (a: StandAufgabe) => a.status === "Done" && !!a.completedAt && a.completedAt >= ersteWoche;

  const zeilen = new Map<string, ProjektZeile>();
  const zeile = (pid: string | null): ProjektZeile => {
    const key = pid ?? OHNE_PROJEKT;
    let z = zeilen.get(key);
    if (!z) {
      const p = projekte.find((x) => x.id === pid);
      z = {
        id: key, name: p ? p.name : "", color: p ? p.color : "#94a3b8",
        erledigt: 0, inArbeit: 0, offen: 0, gesamt: 0, prozent: 0,
        prio: { Critical: 0, High: 0, Medium: 0, Low: 0 },
        ueberfaellig: 0, letzteAktivitaet: null, erledigtImZeitraum: 0,
      };
      zeilen.set(key, z);
    }
    return z;
  };

  for (const a of aktiv) {
    const z = zeile(a.projectId);
    z.gesamt++;
    if (a.status === "Done") z.erledigt++;
    else if (a.status === "InProgress") z.inArbeit++;
    else z.offen++;
    if (istOffen(a)) {
      if (a.priority in z.prio) z.prio[a.priority as keyof ProjektZeile["prio"]]++;
      if (a.dueDate && a.dueDate < jetzt) z.ueberfaellig++;
    }
    if (imZeitraum(a)) z.erledigtImZeitraum++;
    if (!z.letzteAktivitaet || a.updatedAt > z.letzteAktivitaet) z.letzteAktivitaet = a.updatedAt;
  }
  // Leere Projekte ebenfalls zeigen — „mit allen Projekten“.
  for (const p of projekte) zeile(p.id);

  const liste = [...zeilen.values()].map((z) => ({ ...z, prozent: z.gesamt ? Math.round((100 * z.erledigt) / z.gesamt) : 0 }));
  // Oben steht, wo noch am meisten zu tun ist; leere Projekte ganz unten.
  liste.sort((x, y) => (y.gesamt ? 1 : 0) - (x.gesamt ? 1 : 0) || (y.offen + y.inArbeit) - (x.offen + x.inArbeit) || x.name.localeCompare(y.name));

  const summe = (f: (z: ProjektZeile) => number) => liste.reduce((s, z) => s + f(z), 0);
  const g = { erledigt: summe((z) => z.erledigt), inArbeit: summe((z) => z.inArbeit), offen: summe((z) => z.offen), gesamt: summe((z) => z.gesamt), ueberfaellig: summe((z) => z.ueberfaellig), erledigtImZeitraum: summe((z) => z.erledigtImZeitraum) };

  const wochen: Woche[] = [];
  for (let i = 0; i < wochenAnzahl; i++) {
    const start = new Date(ersteWoche.getTime() + i * 7 * TAG);
    wochen.push({ start, label: `${String(start.getUTCDate()).padStart(2, "0")}.${String(start.getUTCMonth() + 1).padStart(2, "0")}.`, count: 0 });
  }
  for (const a of aktiv) {
    if (!imZeitraum(a)) continue;
    const i = Math.floor((wochenStart(a.completedAt!).getTime() - ersteWoche.getTime()) / (7 * TAG));
    if (i >= 0 && i < wochen.length) wochen[i].count++;
  }

  return {
    gesamt: { ...g, prozent: g.gesamt ? Math.round((100 * g.erledigt) / g.gesamt) : 0 },
    projekte: liste,
    wochen,
    inArbeit: aktiv.filter((a) => a.status === "InProgress").sort((x, y) => +y.updatedAt - +x.updatedAt).slice(0, listeMax),
    zuletztErledigt: aktiv.filter(imZeitraum).sort((x, y) => +y.completedAt! - +x.completedAt!).slice(0, listeMax),
  };
}
