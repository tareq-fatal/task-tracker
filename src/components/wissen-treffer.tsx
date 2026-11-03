import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { Treffer } from "@/lib/wissen/dienst";

/** Ausschnitt aus ts_headline: **…** markiert den Treffer; als <mark>, nie als HTML. */
function Ausschnitt({ text }: { text: string }) {
  const teile = text.split(/\*\*/);
  return (
    <span>
      {teile.map((t, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-amber-200/70 px-0.5 dark:bg-amber-500/30">{t}</mark> : <span key={i}>{t}</span>))}
    </span>
  );
}

export function WissenTreffer({ treffer, q, t, mitProjekt = false }: { treffer: Treffer[]; q: string; t: Dict; mitProjekt?: boolean }) {
  if (treffer.length === 0) return <p className="text-sm text-muted-foreground">{t["wissen.noHits"].replace("{q}", q)}</p>;
  return (
    <section data-testid="wissen-treffer">
      <h2 className="mb-2 font-semibold">{t["wissen.hits"]}</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {treffer.map((x) => {
          const href = x.typ === "seite" ? `/projects/${x.projectId}/wissen/${x.slug}` : `/projects/${x.projectId}/wissen#e-${x.id}`;
          return (
            <li key={`${x.typ}-${x.id}`} className="px-4 py-2.5">
              <Link href={href} className="font-medium hover:underline" dir="auto">
                {x.typ === "entscheidung" ? `${t["wissen.decisions"]}: ` : ""}
                {x.titel.length > 120 ? `${x.titel.slice(0, 120)} …` : x.titel}
              </Link>
              {mitProjekt && <span className="ms-2 text-xs text-muted-foreground">{x.projekt}</span>}
              <p className="text-xs text-muted-foreground" dir="auto"><Ausschnitt text={x.ausschnitt} /></p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
