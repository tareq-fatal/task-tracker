"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Trash2, Plus, Flag, Play } from "lucide-react";
import {
  addColumnAction, updateColumnAction, deleteColumnAction, moveColumnAction, applyTemplateAction,
  type ColumnLite,
} from "@/actions/workflow-columns";
import { WORKFLOW_TEMPLATES, type TemplateKey } from "@/lib/workflow";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUSES = ["Todo", "InProgress", "Done"] as const;

export function WorkflowEditor({ projectId, initial }: { projectId: string; initial: ColumnLite[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="space-y-5">
      {/* Templates */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <span className="text-sm font-medium">{t("workflow.applyTemplate")}:</span>
        {(Object.keys(WORKFLOW_TEMPLATES) as TemplateKey[]).map((key) => (
          <Button key={key} size="sm" variant="outline" disabled={pending}
            title={t("workflow.replaceWarn")}
            onClick={() => { if (initial.length === 0 || confirm(t("workflow.replaceWarn"))) run(() => applyTemplateAction(projectId, key)); }}>
            {WORKFLOW_TEMPLATES[key].label} ({WORKFLOW_TEMPLATES[key].columns.length})
          </Button>
        ))}
      </div>

      {/* Columns */}
      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("workflow.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {initial.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5" data-testid="wf-col">
              <span className="flex flex-col">
                <button disabled={pending || i === 0} title="↑" onClick={() => run(() => moveColumnAction(c.id, "up"))} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button>
                <button disabled={pending || i === initial.length - 1} title="↓" onClick={() => run(() => moveColumnAction(c.id, "down"))} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button>
              </span>
              <input type="color" defaultValue={c.color} title={c.name}
                onBlur={(e) => e.target.value !== c.color && run(() => updateColumnAction(c.id, { color: e.target.value }))}
                className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
              <Input defaultValue={c.name} aria-label="column name" className="h-8 w-40"
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => updateColumnAction(c.id, { name: e.target.value }))} />
              <select defaultValue={c.status} title={t("workflow.wip")} className="h-8 rounded-md border bg-background px-1.5 text-xs"
                onChange={(e) => run(() => updateColumnAction(c.id, { status: e.target.value }))}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs" title={t("workflow.wip")}>
                WIP
                <Input type="number" min={0} defaultValue={c.wipLimit ?? ""} className="h-8 w-16"
                  onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== c.wipLimit) run(() => updateColumnAction(c.id, { wipLimit: v })); }} />
              </label>
              <button title={t("workflow.markInitial")} onClick={() => run(() => updateColumnAction(c.id, { isInitial: true }))}
                className={cn("rounded p-1.5", c.isInitial ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300" : "text-muted-foreground hover:bg-muted")}><Play className="h-3.5 w-3.5" /></button>
              <button title={t("workflow.markFinal")} onClick={() => run(() => updateColumnAction(c.id, { isFinal: true }))}
                className={cn("rounded p-1.5", c.isFinal ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "text-muted-foreground hover:bg-muted")}><Flag className="h-3.5 w-3.5" /></button>
              <span className="ms-auto whitespace-nowrap text-xs text-muted-foreground">{c.taskCount} {t("workflow.tasks")}</span>
              {c.isInitial && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">{t("workflow.initialBadge")}</span>}
              {c.isFinal && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{t("workflow.finalBadge")}</span>}
              <button disabled={pending} title={t("workflow.delete")} onClick={() => run(() => deleteColumnAction(c.id))}
                className="rounded p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}

      {/* Add column */}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { run(() => addColumnAction(projectId, newName)); setNewName(""); } }}>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("workflow.addPlaceholder")} className="w-56" />
        <Button type="submit" disabled={pending || !newName.trim()}><Plus className="me-1 h-4 w-4" /> {t("workflow.add")}</Button>
      </form>
    </div>
  );
}
