import Link from "next/link";
import type { ReactNode } from "react";
import { slugify } from "@/lib/wissen/text";

// TOF-0839: kleiner, SICHERER Markdown-Renderer für Wissen-Seiten — erzeugt React-Elemente,
// nie HTML-Strings (kein dangerouslySetInnerHTML, kein Skript aus dem Inhalt). Kann:
// Überschriften, Listen (auch Aufgabenlisten), Zitate, Code-Blöcke, Tabellen, Trennlinien,
// **fett**, *kursiv*, `code`, [Text](https://…), [[slug]]-Verweise und TOF-XXXX-Aufgabenlinks.

type Ctx = { projectId: string; tofLinks: Record<string, string> };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]+\]\((?:https?:\/\/|\/(?!\/)|mailto:)[^)\s]+\))|(\bTOF-\d{4}\b)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g;

function inline(text: string, ctx: Ctx, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const t = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(t.slice(2, -2), ctx, k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(t.slice(1, -1), ctx, k)}</em>);
    else if (m[4]) {
      const [ziel, label] = t.slice(2, -2).split("|");
      out.push(
        <Link key={k} href={`/projects/${ctx.projectId}/wissen/${slugify(ziel)}`} className="text-primary underline-offset-2 hover:underline">
          {label ?? ziel}
        </Link>,
      );
    } else if (m[5]) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const extern = /^https?:/.test(lm[2]);
      out.push(
        <a key={k} href={lm[2]} className="text-primary underline underline-offset-2" {...(extern ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
          {lm[1]}
        </a>,
      );
    } else if (m[6]) {
      const id = ctx.tofLinks[t];
      out.push(id ? <Link key={k} href={`/tasks/${id}`} className="font-medium text-primary hover:underline">{t}</Link> : t);
    } else if (m[7]) {
      out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline underline-offset-2">{t}</a>);
    }
    last = idx + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const zellen = (z: string) => z.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

export function WissenMarkdown({ text, projectId, tofLinks = {} }: { text: string; projectId: string; tofLinks?: Record<string, string> }) {
  const ctx: Ctx = { projectId, tofLinks };
  const zeilen = text.replace(/\r\n?/g, "\n").split("\n");
  const bloecke: ReactNode[] = [];
  let i = 0;
  let b = 0;
  while (i < zeilen.length) {
    const z = zeilen[i];
    const key = `b${b++}`;
    if (!z.trim()) {
      i++;
      continue;
    }
    const fence = /^```/.exec(z);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < zeilen.length && !/^```/.test(zeilen[i])) code.push(zeilen[i++]);
      i++;
      bloecke.push(<pre key={key} className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed" dir="ltr">{code.join("\n")}</pre>);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(z);
    if (h) {
      const ebene = h[1].length;
      const cls = ["text-xl font-bold mt-4", "text-lg font-semibold mt-4", "text-base font-semibold mt-3", "text-sm font-semibold mt-3", "text-sm font-semibold", "text-sm font-semibold"][ebene - 1];
      const Tag = (`h${Math.min(ebene + 1, 6)}`) as "h2";
      bloecke.push(<Tag key={key} className={cls}>{inline(h[2], ctx, key)}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(z)) {
      bloecke.push(<hr key={key} className="my-3" />);
      i++;
      continue;
    }
    if (/^\|.*\|\s*$/.test(z) && i + 1 < zeilen.length && /^\|?\s*:?-{2,}/.test(zeilen[i + 1])) {
      const kopf = zellen(z);
      i += 2;
      const rows: string[][] = [];
      while (i < zeilen.length && /^\|.*\|\s*$/.test(zeilen[i])) rows.push(zellen(zeilen[i++]));
      bloecke.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>{kopf.map((c, j) => <th key={j} className="border-b px-2 py-1 text-start font-semibold">{inline(c, ctx, `${key}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="align-top">{r.map((c, j) => <td key={j} className="border-b px-2 py-1">{inline(c, ctx, `${key}r${ri}c${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^>\s?/.test(z)) {
      const q: string[] = [];
      while (i < zeilen.length && /^>\s?/.test(zeilen[i])) q.push(zeilen[i++].replace(/^>\s?/, ""));
      bloecke.push(<blockquote key={key} className="border-s-4 ps-3 text-muted-foreground">{inline(q.join(" "), ctx, key)}</blockquote>);
      continue;
    }
    const liste = /^(\s*)([-*+]|\d+[.)])\s+/;
    if (liste.test(z)) {
      const geordnet = /^\s*\d/.test(z);
      const items: ReactNode[] = [];
      while (i < zeilen.length && liste.test(zeilen[i])) {
        const roh = zeilen[i].replace(liste, "");
        const tief = (liste.exec(zeilen[i])?.[1].length ?? 0) >= 2;
        const task = /^\[( |x|X)\]\s+/.exec(roh);
        const inhalt = task ? roh.slice(task[0].length) : roh;
        items.push(
          <li key={i} className={tief ? "ms-5" : undefined}>
            {task && <input type="checkbox" checked={task[1] !== " "} readOnly disabled className="me-1.5 align-middle" />}
            {inline(inhalt, ctx, `${key}l${i}`)}
          </li>,
        );
        i++;
      }
      bloecke.push(geordnet ? <ol key={key} className="list-decimal space-y-0.5 ps-5">{items}</ol> : <ul key={key} className="list-disc space-y-0.5 ps-5">{items}</ul>);
      continue;
    }
    const absatz: string[] = [];
    while (i < zeilen.length && zeilen[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|\|.*\|\s*$)/.test(zeilen[i])) absatz.push(zeilen[i++]);
    if (absatz.length === 0) absatz.push(zeilen[i++]);
    bloecke.push(<p key={key}>{inline(absatz.join(" "), ctx, key)}</p>);
  }
  return <div className="space-y-2 break-words text-sm leading-relaxed" dir="auto" data-testid="wissen-markdown">{bloecke}</div>;
}
