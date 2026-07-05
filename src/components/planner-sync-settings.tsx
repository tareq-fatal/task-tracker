"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  linkPlannerPlanAction,
  unlinkPlannerSyncAction,
  syncNowAction,
  type PlannerSyncState,
  type PlannerSyncView,
} from "@/actions/planner-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";

function LinkButton() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "…" : t("settings.planner.link")}
    </Button>
  );
}

export function PlannerSyncSettings({ view }: { view: PlannerSyncView }) {
  const { t, locale } = useT();
  const [state, formAction] = useFormState<PlannerSyncState, FormData>(
    linkPlannerPlanAction,
    {}
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string>("");

  if (!view.graphConfigured) {
    return (
      <p className="text-sm italic text-muted-foreground">
        {t("settings.planner.notConfigured")}
      </p>
    );
  }
  if (view.projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.planner.noProjects")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("settings.planner.desc")}</p>
      {msg && <p className="text-sm text-indigo-600">{msg}</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="divide-y rounded-md border">
        {view.projects.map((p) => (
          <div key={p.id} className="space-y-2 p-3">
            <div className="font-medium">{p.name}</div>
            {p.sync ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {p.sync.planId}
                </code>
                <span className="text-muted-foreground">· {p.sync.direction}</span>
                <span className="text-xs text-muted-foreground">
                  {t("settings.planner.lastSync")}:{" "}
                  {p.sync.lastSyncedAt
                    ? formatDateTime(p.sync.lastSyncedAt, locale)
                    : t("settings.planner.never")}
                  {p.sync.lastStatus ? ` — ${p.sync.lastStatus}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await syncNowAction(p.sync!.id);
                      setMsg(r.summary ?? r.error ?? "");
                    })
                  }
                >
                  {t("settings.planner.syncNow")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await unlinkPlannerSyncAction(p.sync!.id);
                    })
                  }
                >
                  {t("settings.planner.unlink")}
                </Button>
              </div>
            ) : (
              <form action={formAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="projectId" value={p.id} />
                <div className="flex-1">
                  <Input
                    name="planId"
                    placeholder={t("settings.planner.planId")}
                    required
                  />
                </div>
                <select
                  name="direction"
                  defaultValue="pull"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="pull">{t("settings.planner.dir.pull")}</option>
                  <option value="push">{t("settings.planner.dir.push")}</option>
                  <option value="two-way">{t("settings.planner.dir.twoway")}</option>
                </select>
                <LinkButton />
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
