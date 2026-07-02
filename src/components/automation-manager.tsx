"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import { addRuleAction, toggleRuleAction, deleteRuleAction, type RuleLite } from "@/actions/automation";
import { TRIGGER_TYPES, ACTION_TYPES } from "@/lib/automation";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/enums";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const triggerNeedsValue = (t: string) => t !== "created";
const valuesFor = (actionType: string) => (actionType === "set_status" ? TASK_STATUSES : TASK_PRIORITIES);

export function AutomationManager({ initial }: { initial: RuleLite[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<string>("status_to");
  const [triggerValue, setTriggerValue] = useState<string>("Done");
  const [action, setAction] = useState<string>("set_priority");
  const [actionValue, setActionValue] = useState<string>("Low");
  const [err, setErr] = useState("");

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); setErr(r.error ?? ""); router.refresh(); });

  function add() {
    if (!name.trim()) return;
    run(async () => {
      const r = await addRuleAction(name, trigger, triggerNeedsValue(trigger) ? triggerValue : "", action, actionValue);
      if (r.ok) setName("");
      return r;
    });
  }

  return (
    <div className="space-y-5">
      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("auto.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {initial.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" data-testid="auto-rule">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                {t("auto.when")} <b>{t(`auto.trigger.${r.triggerType}` as never)}</b>{r.triggerValue ? ` ${r.triggerValue}` : ""} · {t("auto.then")} <b>{t(`auto.action.${r.actionType}` as never)}</b> {r.actionValue}
              </span>
              <label className="ms-auto flex items-center gap-1 text-xs">
                <input type="checkbox" checked={r.enabled} onChange={(e) => run(() => toggleRuleAction(r.id, e.target.checked))} className="h-4 w-4 accent-emerald-600" />
                {r.enabled ? "on" : "off"}
              </label>
              <button disabled={pending} title={t("auto.delete")} onClick={() => run(() => deleteRuleAction(r.id))} className="rounded p-1.5 text-rose-500 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auto.name")} className="w-full max-w-sm" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{t("auto.when")}</span>
          <select aria-label={t("auto.when")} value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-9 rounded-md border bg-background px-2">
            {TRIGGER_TYPES.map((tt) => <option key={tt} value={tt}>{t(`auto.trigger.${tt}` as never)}</option>)}
          </select>
          {triggerNeedsValue(trigger) && (
            <select aria-label={t("auto.when")} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} className="h-9 rounded-md border bg-background px-2">
              {(trigger === "priority_to" ? TASK_PRIORITIES : TASK_STATUSES).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <span className="font-semibold">{t("auto.then")}</span>
          <select aria-label={t("auto.then")} value={action} onChange={(e) => { setAction(e.target.value); setActionValue(valuesFor(e.target.value)[0]); }} className="h-9 rounded-md border bg-background px-2">
            {ACTION_TYPES.map((a) => <option key={a} value={a}>{t(`auto.action.${a}` as never)}</option>)}
          </select>
          <select aria-label={t("auto.then")} value={actionValue} onChange={(e) => setActionValue(e.target.value)} className="h-9 rounded-md border bg-background px-2">
            {valuesFor(action).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <Button onClick={add} disabled={pending || !name.trim()}><Plus className="me-1 h-4 w-4" /> {t("auto.add")}</Button>
        </div>
        {err && <span className="text-xs font-medium text-destructive">{err}</span>}
      </div>
    </div>
  );
}
