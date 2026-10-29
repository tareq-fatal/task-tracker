import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dictionaries } from "./i18n";
import { LOCALES } from "./enums";

// TOF-0789 (Tarek 29.10.2026): Skeleton Screens statt Spinner/leerer Flächen.
// Quelltext-Wächter: jede Ladeansicht nutzt die gemeinsamen Bausteine, hat
// genau einen role="status"-Wrapper und dieselbe Container-Breite wie die Seite.

const APP = "src/app/(app)";
const read = (p: string) => readFileSync(p, "utf8");

/** route → page.tsx dir; loading.tsx lives in the same segment. */
const ROUTES = [
  "", // Dashboard (+ Fallback)
  "/board",
  "/projects/[id]/board",
  "/list",
  "/tasks",
  "/projects",
  "/tasks/[id]",
  "/projects/[id]",
  "/projects/[id]/leads",
  "/admin/mandanten",
  // eigene Dateien, damit übergeordnete loading.tsx nicht falsch greifen
  "/tasks/new",
  "/tasks/[id]/edit",
  "/projects/[id]/kontext",
  "/projects/[id]/workflow",
];

/** Main return container of a page = LAST `className="container …"` (early
 *  returns like "not found" come before the main JSX in tasks/[id]). */
function containerOf(src: string): string | undefined {
  const all = Array.from(src.matchAll(/className="(container\b[^"]*)"/g));
  return all.length ? all[all.length - 1][1] : undefined;
}

describe("TOF-0789: loading.tsx je Route", () => {
  for (const r of ROUTES) {
    const file = `${APP}${r}/loading.tsx`;
    it(`${r || "/"} hat loading.tsx mit Skeleton-Bausteinen`, () => {
      expect(existsSync(file), file).toBe(true);
      expect(existsSync(`${APP}${r}/page.tsx`), `${r}/page.tsx`).toBe(true);
      const src = read(file);
      expect(src).toMatch(/from "@\/components\/skeleton"/);
      expect(src).not.toMatch(/animate-spin|Loader2/);
      // gemeinsamer Wrapper (role="status") + Text aus dem Wörterbuch
      expect(src).toMatch(/<SkeletonScreen label=\{t\["common\.loading"\]\}/);
      expect(src).toMatch(/getDictionary\(getActiveLocale\(\)\)/);
    });
  }

  it("auch die übrigen loading.tsx im (app)-Baum nutzen den Wrapper", () => {
    for (const r of ["/roadmap", "/reports/infographics", "/settings/branding"]) {
      const src = read(`${APP}${r}/loading.tsx`);
      expect(src, r).toMatch(/<SkeletonScreen /);
      expect(src, r).not.toMatch(/animate-spin|Loader2/);
    }
  });

  it("Container-Klasse der Ladeansicht == Container der Seite (kein Breitensprung)", () => {
    for (const r of ["", "/projects/[id]/leads", "/admin/mandanten", "/tasks/[id]", "/board", "/list", "/tasks", "/projects", "/projects/[id]", "/projects/[id]/board"]) {
      const page = containerOf(read(`${APP}${r}/page.tsx`));
      const loading = containerOf(read(`${APP}${r}/loading.tsx`));
      expect(page, `${r} page`).toBeTruthy();
      expect(loading, r || "/").toBe(page);
    }
  });

  it("Kanban-Skeleton hat dieselbe Spaltenbreite/Scrollklasse wie kanban-board.tsx", () => {
    const board = read("src/components/kanban-board.tsx");
    const sk = read("src/components/skeleton.tsx");
    expect(board).toContain('className="board-col flex w-[82vw] shrink-0 flex-col xs:w-[70vw] sm:w-80"');
    expect(sk).toContain('className="board-col flex w-[82vw] shrink-0 flex-col xs:w-[70vw] sm:w-80"');
    expect(sk).toContain('className="board-scroll flex gap-4 overflow-x-auto pb-4"');
    expect(sk).toContain("min-h-[62vh]");
  });
});

describe("TOF-0789: Skeleton-Baustein", () => {
  const sk = read("src/components/skeleton.tsx");

  it("Skeleton ist aria-hidden und nutzt die Shimmer-Klasse (kein animate-pulse mehr)", () => {
    const fn = sk.slice(sk.indexOf("export function Skeleton("), sk.indexOf("export function SkeletonScreen"));
    expect(fn).toContain('aria-hidden="true"');
    expect(fn).toContain("tt-skeleton");
    expect(sk).not.toContain("animate-pulse");
    // API kompatibel: className-Prop bleibt
    expect(fn).toMatch(/className\?: string/);
  });

  it("SkeletonScreen ist der role=status-Wrapper mit sr-only Text", () => {
    const fn = sk.slice(sk.indexOf("export function SkeletonScreen"), sk.indexOf("export function SkeletonText"));
    expect(fn).toContain('role="status"');
    expect(fn).toContain('aria-busy="true"');
    expect(fn).toMatch(/className="sr-only">\{label\}/);
  });

  it("keine Hooks / kein server-only → in Server- und Client-Komponenten nutzbar", () => {
    expect(sk).not.toMatch(/useState|useEffect|server-only|"use client"/);
  });

  it("Lade-Text existiert in allen Sprachen", () => {
    for (const loc of LOCALES) {
      expect((dictionaries[loc] as Record<string, string>)["common.loading"], loc).toBeTruthy();
    }
  });
});

describe("TOF-0789: Shimmer-CSS", () => {
  const css = read("src/app/globals.css");

  it(".tt-skeleton animiert per background-position", () => {
    expect(css).toMatch(/@keyframes tt-shimmer\s*\{[^}]*background-position/);
    expect(css).toMatch(/\.tt-skeleton\s*\{[^}]*animation:\s*tt-shimmer/);
  });

  it("RTL-Variante kehrt die Laufrichtung um", () => {
    expect(css).toMatch(/\[dir="rtl"\]\s*\.tt-skeleton\s*\{[^}]*animation-direction:\s*reverse/);
  });

  it("Dark-Mode hat einen eigenen, schwächeren Lichtverlauf", () => {
    expect(css).toMatch(/\.dark\s+\.tt-skeleton\s*\{[^}]*--tt-shine/);
  });

  it("prefers-reduced-motion: animation none", () => {
    const blocks = Array.from(css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)).map((m) => m[1]);
    const hit = blocks.find((b) => b.includes(".tt-skeleton"));
    expect(hit).toBeTruthy();
    expect(hit).toMatch(/animation:\s*none/);
  });
});

describe("TOF-0789: Client-Inhaltsbereiche zeigen Skeletons statt Spinner/leer", () => {
  it("Suche, Benachrichtigungen, @-Erwähnung, Mandant-Löschvorschau, Webhook-Protokoll", () => {
    for (const f of [
      "src/components/global-search.tsx",
      "src/components/notification-bell.tsx",
      "src/components/mention-textarea.tsx",
      "src/components/delete-tenant-button.tsx",
      "src/components/webhooks-manager.tsx",
    ]) {
      expect(read(f), f).toMatch(/<SkeletonScreen /);
    }
    // Löschvorschau: kein Spinner mehr neben "common.loading"
    expect(read("src/components/delete-tenant-button.tsx")).not.toMatch(/animate-spin" \/>\s*\{t\("common\.loading"\)\}/);
  });
});
