"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileStack, PlayCircle } from "lucide-react";
import { addTemplateAction, deleteTemplateAction, createFromTemplateAction, type TemplateLite } from "@/actions/templates";
import { TASK_TYPES, TASK_PRIORITIES } from "@/lib/enums";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TemplatesManager({ initial }: { initial: TemplateLite[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", title: "", description: "", type: "Task", priority: "Medium", storyPoints: "", subtasksText: "" });
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | void>) =>
    start(async () => { const r = await fn(); setErr((r && r.error) || ""); router.refresh(); });

  function add() {
    if (!form.name.trim() || !form.title.trim()) return;
    run(async () => {
      const r = await addTemplateAction({
        name: form.name, title: form.title, description: form.description, type: form.type, priority: form.priority,
        storyPoints: form.storyPoints ? Number(form.storyPoints) : null, subtasksText: form.subtasksText,
      });
      if (r.ok) setForm({ name: "", title: "", description: "", type: "Task", priority: "Medium", storyPoints: "", subtasksText: "" });
      return r;
    });
  }

  return (
    <div className="space-y-5">
      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("tpl.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {initial.map((tpl) => (
            <li key={tpl.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" data-testid="tpl-item">
              <FileStack className="h-4 w-4 text-indigo-500" />
              <span className="font-medium">{tpl.name}</span>
              <span className="text-xs text-muted-foreground">{tpl.title} · {t(`type.${tpl.type}` as never)} · {t(`priority.${tpl.priority}` as never)}{tpl.subtasks.length ? ` · ${tpl.subtasks.length} ☑` : ""}</span>
              <Button size="sm" variant="outline" className="ms-auto" disabled={pending} onClick={() => start(async () => { await createFromTemplateAction(tpl.id); })}>
                <PlayCircle className="me-1 h-4 w-4" /> {t("tpl.create")}
              </Button>
              <button disabled={pending} title={t("tpl.delete")} onClick={() => run(() => deleteTemplateAction(tpl.id))} className="rounded p-1.5 text-rose-500 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap gap-2">
          <Input value={form.name} onChange={set("name")} placeholder={t("tpl.name")} className="w-48" />
          <Input value={form.title} onChange={set("title")} placeholder={t("tpl.taskTitle")} className="w-56" />
          <select aria-label={t("tpl.taskTitle")} value={form.type} onChange={set("type")} className="h-9 rounded-md border bg-background px-2 text-sm">
            {TASK_TYPES.map((ty) => <option key={ty} value={ty}>{t(`type.${ty}` as never)}</option>)}
          </select>
          <select aria-label={t("task.priority")} value={form.priority} onChange={set("priority")} className="h-9 rounded-md border bg-background px-2 text-sm">
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}` as never)}</option>)}
          </select>
          <Input type="number" min={0} value={form.storyPoints} onChange={set("storyPoints")} placeholder="SP" className="w-16" />
        </div>
        <Input value={form.description} onChange={set("description")} placeholder={t("tpl.desc")} className="w-full" />
        <textarea value={form.subtasksText} onChange={set("subtasksText")} placeholder={t("tpl.subtasks")} rows={3} className="w-full rounded-md border bg-background p-2 text-sm" />
        <div className="flex items-center gap-2">
          <Button onClick={add} disabled={pending || !form.name.trim() || !form.title.trim()}><Plus className="me-1 h-4 w-4" /> {t("tpl.add")}</Button>
          {err && <span className="text-xs font-medium text-destructive">{err}</span>}
        </div>
      </div>
    </div>
  );
}
