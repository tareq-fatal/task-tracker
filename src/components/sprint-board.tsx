"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";
import { ErrorText } from "@/components/error-text";
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
    <div className="space-y-6">
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
            <ErrorText code={state.error} className="text-xs text-destructive" />
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
                    <Button size="sm" variant="secondary" onClick={() => act(() => setSprintStatusAction(s.id, "active"))}>
                      {t("sprint.activate")}
                    </Button>
                  )}
                  {s.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => act(() => setSprintStatusAction(s.id, "closed"))}>
                      {t("sprint.close")}
                    </Button>
                  )}
                </div>
              </div>
              {s.goal && <p className="mb-1 text-xs text-muted-foreground">🎯 {s.goal}</p>}
              <ul className="space-y-1">
                {s.tasks.map((tk) => (
                  <li key={tk.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{tk.title}</span>
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
            </div>
          ))}
        </div>

        {/* Backlog */}
        <div className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">{t("sprint.backlog")} ({view.backlog.length})</h2>
          <ul className="space-y-1">
            {view.backlog.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{tk.title}</span>
                {view.targetSprintId && (
                  <button
                    onClick={() => act(() => setTaskSprintAction(tk.id, view.targetSprintId))}
                    className="shrink-0 rounded-md border px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
                  >
                    {t("sprint.add")}
                  </button>
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
