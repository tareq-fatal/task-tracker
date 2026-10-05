import { describe, expect, it } from "vitest";
import {
  MAX_TAGS,
  MAX_TAG_LEN,
  mergeTags,
  normalizeTag,
  parseTags,
  removeTags,
  sortTags,
} from "./tags";

describe("normalizeTag", () => {
  it("bringt Schreibweisen auf eine Form", () => {
    expect(normalizeTag("Live-Feedback")).toBe("live-feedback");
    expect(normalizeTag("  Live Feedback  ")).toBe("live-feedback");
    expect(normalizeTag("LIVE_FEEDBACK")).toBe("live-feedback");
  });

  it("behält Umlaute — deutsche Schlagworte sollen deutsch aussehen", () => {
    expect(normalizeTag("Prüfung")).toBe("prüfung");
    expect(normalizeTag("Größe")).toBe("größe");
  });

  it("wirft Satzzeichen und Mehrfach-Bindestriche weg", () => {
    expect(normalizeTag("#qs!")).toBe("qs");
    expect(normalizeTag("a -- b")).toBe("a-b");
    expect(normalizeTag("---")).toBe("");
    expect(normalizeTag("")).toBe("");
  });

  it("kürzt und lässt keinen Bindestrich am Ende stehen", () => {
    const lang = normalizeTag("a".repeat(MAX_TAG_LEN + 10));
    expect(lang.length).toBe(MAX_TAG_LEN);
    expect(normalizeTag("x".repeat(MAX_TAG_LEN - 1) + " y")).not.toMatch(/-$/);
  });
});

describe("parseTags", () => {
  it("trennt an Komma, Semikolon und Zeilenumbruch", () => {
    expect(parseTags("live-feedback, checkliste; qs\nbuilder")).toEqual([
      "live-feedback",
      "checkliste",
      "qs",
      "builder",
    ]);
  });

  // Das Leerzeichen trennt NICHT: wer „live feedback" tippt, meint ein
  // Schlagwort und nicht zwei.
  it("macht aus inneren Leerzeichen einen Bindestrich", () => {
    expect(parseTags("live feedback, qs")).toEqual(["live-feedback", "qs"]);
    expect(parseTags(["Zur Prüfung"])).toEqual(["zur-prüfung"]);
  });

  it("nimmt auch eine Liste", () => {
    expect(parseTags(["Webseite", "Demo"])).toEqual(["webseite", "demo"]);
  });

  it("entfernt Doppelte, auch solche aus unterschiedlicher Schreibweise", () => {
    expect(parseTags("QS, qs, Q S")).toEqual(["qs", "q-s"]);
    expect(parseTags("Prüfung, pruefung")).toEqual(["prüfung", "pruefung"]);
    expect(parseTags("demo,Demo,DEMO")).toEqual(["demo"]);
  });

  it("behält die Reihenfolge der Eingabe", () => {
    expect(parseTags("z, a, m")).toEqual(["z", "a", "m"]);
  });

  it("deckelt die Anzahl statt zu scheitern", () => {
    const viele = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `t${i}`);
    expect(parseTags(viele).length).toBe(MAX_TAGS);
  });

  it("macht aus Leerem eine leere Liste, nicht aus Versehen ein leeres Schlagwort", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("  ,  ; ")).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe("mergeTags / removeTags", () => {
  it("legt dazu, ohne Vorhandenes zu verlieren", () => {
    expect(mergeTags(["live-feedback"], "QS")).toEqual(["live-feedback", "qs"]);
  });

  it("legt nichts doppelt dazu", () => {
    expect(mergeTags(["qs"], ["QS", "qs"])).toEqual(["qs"]);
  });

  it("nimmt weg und ignoriert, was nicht da war", () => {
    expect(removeTags(["a", "b"], "B")).toEqual(["a"]);
    expect(removeTags(["a"], "gibtsnicht")).toEqual(["a"]);
    expect(removeTags([], "a")).toEqual([]);
  });
});

describe("sortTags", () => {
  it("sortiert für die Anzeige, ohne die Quelle zu verändern", () => {
    const quelle = ["qs", "builder", "änderung"];
    expect(sortTags(quelle)).toEqual(["änderung", "builder", "qs"]);
    expect(quelle).toEqual(["qs", "builder", "änderung"]);
  });
});
