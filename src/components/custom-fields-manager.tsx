"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addFieldDefAction, deleteFieldDefAction, toggleRequiredAction, type FieldDefLite } from "@/actions/custom-fields";
import { FIELD_TYPES } from "@/lib/custom-fields";
import { useT } from "@/components/i18n-provider";
import { ErrorText } from "@/components/error-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CustomFieldsManager({ initial }: { initial: FieldDefLite[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [err, setErr] = useState("");

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (r.error) setErr(r.error); else setErr(""); router.refresh(); });

  function add() {
    if (!name.trim()) return;
    run(async () => {
      const r = await addFieldDefAction(name, type, options.split(",").map((o) => o.trim()).filter(Boolean));
      if (r.ok) { setName(""); setOptions(""); }
      return r;
    });
  }

  return (
    <div className="space-y-5">
      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("cf.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {initial.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" data-testid="cf-def">
              <span className="font-medium">{f.name}</span>
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">{t(`cf.type.${f.type}`)}</span>
              {f.type === "select" && <span className="text-xs text-muted-foreground">{f.options.join(" · ")}</span>}
              <label className="ms-auto flex items-center gap-1 text-xs">
                <input type="checkbox" checked={f.required} onChange={(e) => run(() => toggleRequiredAction(f.id, e.target.checked))} className="h-4 w-4 accent-indigo-600" />
                {t("cf.required")}
              </label>
              <button disabled={pending} title={t("cf.delete")} onClick={() => run(() => deleteFieldDefAction(f.id))} className="rounded p-1.5 text-rose-500 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
        <label className="flex flex-col gap-1 text-xs">
          {t("cf.name")}
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cf.name")} className="w-48" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("cf.type")}
          <select aria-label={t("cf.type")} value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`cf.type.${ft}`)}</option>)}
          </select>
        </label>
        {type === "select" && (
          <label className="flex flex-col gap-1 text-xs">
            {t("cf.options")}
            <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="A, B, C" className="w-48" />
          </label>
        )}
        <Button onClick={add} disabled={pending || !name.trim()}><Plus className="me-1 h-4 w-4" /> {t("cf.add")}</Button>
        <ErrorText code={err} className="text-xs font-medium text-destructive" />
      </div>
    </div>
  );
}
