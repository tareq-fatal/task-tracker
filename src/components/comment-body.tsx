import Link from "next/link";
import { splitMentions, type KnownUser } from "@/lib/mention-render";

/**
 * Kommentartext mit hervorgehobenen @-Erwähnungen.
 *
 * Nur aufgelöste Benutzernamen des eigenen Mandanten werden hervorgehoben —
 * ein Tippfehler bleibt sichtbar gewöhnlicher Text, damit niemand glaubt,
 * die Erwähnung sei angekommen. Verlinkt wird auf die Personenansicht; die
 * gibt es nur für Verwaltende, deshalb entscheidet `canLink` darüber.
 */
export function CommentBody({
  content,
  users,
  canLink = false,
}: {
  content: string;
  users: KnownUser[];
  canLink?: boolean;
}) {
  const segments = splitMentions(content, users);

  return (
    <p className="whitespace-pre-wrap text-sm">
      {segments.map((seg, i) => {
        if (seg.type === "text") return <span key={i}>{seg.value}</span>;
        const chip = (
          <span className="rounded bg-indigo-100 px-1 font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            {seg.value}
          </span>
        );
        return canLink ? (
          <Link key={i} href={`/tasks?view=person&id=${seg.userId}`} title={seg.name} className="hover:underline">
            {chip}
          </Link>
        ) : (
          <span key={i} title={seg.name}>
            {chip}
          </span>
        );
      })}
    </p>
  );
}
