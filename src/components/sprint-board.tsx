"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createSprintAction,
  setSprintStatusAction,
  setTaskSprintAction,
  type SprintsView,
  type SprintState,
} from "@/actions/sprints";
import { SprintBurndown, SprintVelocity } from "@/components/sprint-charts";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";
import { FeatureHint } from "@/components/onboarding/feature-hint";
import { cn } from "@/lib/utils";

function CreateBtn() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "…" : t("sprint.create")}
    </Button>
  );
}

export function SprintBoard({ view }: { view: SprintsView }) {
  const { t } = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction] = useFormState<SprintState, FormData>(createSprintAction, {});

  if (view.projects.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("sprint.noProjects")}</p>;
  }

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const active = view.sprints.find((s) => s.status === "active");

  return (
    <div className="relative space-y-6">
      {/* First-use coach-mark for the sprint view. */}
      <FeatureHint
        id="sprint"
        titleKey="onboarding.hint.sprint.title"
        textKey="onboarding.hint.sprint.text"
        placement="bottom"
      />

      {/* Project selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("sprint.project")}:</span>
        {view.projects.map((p) => (
          <button
            key={p.id}
            onClick={() => router.push(`/sprints?project=${p.id}`)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              p.id === view.projectId ? "bg-indigo-100 text-indigo-700" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {t("sprint.burndown")}
            {active?.goal ? <span className="ms-2 font-normal text-muted-foreground">🎯 {active.goal}</span> : null}
          </h2>
          <SprintBurndown
            data={view.burndown}
            labels={{ remaining: t("sprint.remaining"), ideal: t("sprint.ideal"), empty: t("sprint.noActive") }}
          />
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {t("sprint.velocity")}
            <span className="ms-2 font-normal text-muted-foreground">
              {t("sprint.avg")}: {view.avgVelocity}
            </span>
          </h2>
          <SprintVelocity
            data={view.velocity}
            labels={{ completed: t("sprint.completed"), total: t("sprint.total"), empty: t("sprint.noClosed") }}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sprints */}
        <div className="space-y-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
            <input type="hidden" name="projectId" value={view.projectId ?? ""} />
            <div className="flex-1">
              <Input name="name" aria-label={t("sprint.name")} placeholder={t("sprint.name")} required />
            </div>
            <Input name="startDate" type="date" aria-label={t("sprint.start")} className="w-36" />
            <Input name="endDate" type="date" aria-label={t("sprint.end")} className="w-36" />
            <div className="w-full">
              <Input name="goal" aria-label={t("sprint.goal")} placeholder={t("sprint.goal")} />
            </div>
            <CreateBtn />
            {state.error && <span className="text-xs text-destructive">{state.error}</span>}
          </form>

          {view.sprints.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("sprint.none")}</p>
          )}
          {view.sprints.map((s) => (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {s.name}{" "}
                  <span
                    className={cn(
                      "ms-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      s.status === "active" && "bg-emerald-100 text-emerald-700",
                      s.status === "planned" && "bg-indigo-100 text-indigo-700",
                      s.status === "closed" && "bg-slate-100 text-slate-600"
                    )}
                  >
                    {t(`sprint.status.${s.status}` as never)}
                  </span>
                </div>
                <div className="flex gap-1">
                  {s.status !== "active" && s.status !== "closed" && (
                    <TooltipHelp textKey="tooltip.start_sprint">
                      <Button size="sm" variant="secondary" onClick={() => act(() => setSprintStatusAction(s.id, "active"))}>
                        {t("sprint.activate")}
                      </Button>
                    </TooltipHelp>
                  )}
                  {s.status === "active" && (
                    <TooltipHelp textKey="tooltip.close_sprint">
                      <Button size="sm" variant="ghost" onClick={() => act(() => setSprintStatusAction(s.id, "closed"))}>
                        {t("sprint.close")}
                      </Button>
                    </TooltipHelp>
                  )}
                </div>
              </div>
              {s.goal && <p className="mb-1 text-xs text-muted-foreground">🎯 {s.goal}</p>}
              <ul className="space-y-1">
                {s.tasks.filter((tk) => !tk.blocked).map((tk) => (
                  <li key={tk.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/tasks/${tk.id}`} className="truncate hover:underline">
                      {tk.title}
                    </Link>
                    <button
                      onClick={() => act(() => setTaskSprintAction(tk.id, null))}
                      className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                    >
                      {t("sprint.remove")}
                    </button>
                  </li>
                ))}
                {s.tasks.length === 0 && (
                  <li className="text-xs text-muted-foreground">{t("sprint.emptyTasks")}</li>
                )}
              </ul>
              {/* Blocked tasks live in their own group so the team sees at a
                  glance what can't move until its blockers are done. */}
              {s.tasks.some((tk) => tk.blocked) && (
                <div
                  data-testid="sprint-blocked-group"
                  className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-500/30 dark:bg-amber-500/10"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    <Ban className="h-3 w-3" />
                    {t("sprint.blockedSection")} ({s.tasks.filter((tk) => tk.blocked).length})
                  </div>
                  <ul className="space-y-1">
                    {s.tasks.filter((tk) => tk.blocked).map((tk) => (
                      <li key={tk.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/tasks/${tk.id}`} className="truncate text-amber-900 hover:underline dark:text-amber-200">
                          {tk.title}
                        </Link>
                        <button
                          onClick={() => act(() => setTaskSprintAction(tk.id, null))}
                          className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                        >
                          {t("sprint.remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Backlog */}
        <div className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">{t("sprint.backlog")} ({view.backlog.length})</h2>
          <ul className="space-y-1">
            {view.backlog.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Link href={`/tasks/${tk.id}`} className="truncate hover:underline">
                    {tk.title}
                  </Link>
                  {tk.blocked && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      <Ban className="h-2.5 w-2.5" />
                      {t("sprint.blockedSection")}
                    </span>
                  )}
                </span>
                {view.targetSprintId && (
                  <TooltipHelp textKey="tooltip.add_to_sprint">
                    <button
                      onClick={() => act(() => setTaskSprintAction(tk.id, view.targetSprintId))}
                      className="shrink-0 rounded-md border px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
                    >
                      {t("sprint.add")}
                    </button>
                  </TooltipHelp>
                )}
              </li>
            ))}
            {view.backlog.length === 0 && (
              <li className="text-xs text-muted-foreground">{t("sprint.backlogEmpty")}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
