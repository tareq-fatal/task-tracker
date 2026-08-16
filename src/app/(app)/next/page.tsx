import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { pickNextUp, hiddenCount, NEXT_UP_LIMIT, type NextBucket } from "@/lib/next-up";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<NextBucket, string> = {
  verify: "next.bucket.verify",
  blocked: "next.bucket.blocked",
  decide: "next.bucket.decide",
  doing: "next.bucket.doing",
};

const BUCKET_EMOJI: Record<NextBucket, string> = {
  verify: "🔍",
  blocked: "⛔",
  decide: "🚩",
  doing: "⏳",
};

/**
 * "Als Nächstes" — höchstens zehn Aufgaben, die auf mich warten.
 *
 * Tarek 14.08.2026: eine Liste mit 164 Aufgaben ist keine Arbeitsliste. Diese
 * Seite beantwortet nur eine Frage: was fasse ich jetzt an? Sie zeigt, was zur
 * Prüfung ansteht, was blockiert ist, was auf eine Entscheidung wartet und was
 * gerade läuft — und hört bei zehn Zeilen auf.
 *
 * Mandantengrenze wie überall über `taskVisibility(user, tenant.id)`.
 */
export default async function NextUpPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const base = await taskVisibility(user, tenant.id);
  const mine = {
    OR: [{ assignedToUserId: user.id }, { assignees: { some: { userId: user.id } } }],
  };

  const rows = await prisma.task.findMany({
    where: { AND: [base, mine, { status: { notIn: ["Done", "Archived"] } }] },
    select: {
      ...taskCardSelect,
      scrumColumn: true,
    },
    take: 300,
  });

  // Wie auf der Karte: eine Aufgabe ist blockiert, wenn eine Aufgabe, von der
  // sie abhängt, noch offen ist — in beiden Schreibrichtungen der Verknüpfung.
  const open = (s: string) => s !== "Done" && s !== "Archived";
  const enriched = rows.map((r) => ({
    ...r,
    blockedByOpen:
      r.linksFrom.filter((l) => open(l.linkedTask.status)).length +
      r.linksTo.filter((l) => open(l.task.status)).length,
  }));

  const groups = pickNextUp(enriched);
  const hidden = hiddenCount(enriched);

  return (
    <div className="container py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t["next.title"]}</h1>
          <p className="text-sm text-muted-foreground">{t["next.subtitle"]}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/list">{t["next.showAll"]}</Link>
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={t["next.empty"]} />
      ) : (
        <div className="space-y-6">
          {groups.map(({ bucket, tasks }) => (
            <section key={bucket}>
              <h2 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span>
                  {BUCKET_EMOJI[bucket]} {t[BUCKET_LABEL[bucket] as keyof typeof t]} ({tasks.length})
                </span>
                {/* Die Abnahmeliste ist regelmäßig länger als zehn — von hier
                    aus geht es zur vollständigen, ungekürzten Liste. */}
                {bucket === "verify" && (
                  <Link href="/list?spalte=to-verify&nur=ich" className="font-normal normal-case text-primary hover:underline">
                    {t["next.allReview"]}
                  </Link>
                )}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </section>
          ))}
          {hidden > 0 && (
            <p className="text-xs text-muted-foreground">
              {t["next.hidden"].replace("{n}", String(hidden)).replace("{limit}", String(NEXT_UP_LIMIT))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
