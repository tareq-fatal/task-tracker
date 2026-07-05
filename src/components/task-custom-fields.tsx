"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFieldValueAction } from "@/actions/custom-fields";
import type { FieldType } from "@/lib/custom-fields";
import { useT } from "@/components/i18n-provider";
import { ErrorText } from "@/components/error-text";
import { Input } from "@/components/ui/input";

export type TaskField = { id: string; name: string; type: FieldType; options: string[]; required: boolean; value: string };

export function TaskCustomFields({ taskId, fields, canEdit }: { taskId: string; fields: TaskField[]; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<Record<string, string>>({});

  function save(fieldId: string, raw: string) {
    start(async () => {
      const r = await setFieldValueAction(taskId, fieldId, raw);
      setErr((e) => ({ ...e, [fieldId]: r.error ?? "" }));
      router.refresh();
    });
  }

  if (fields.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("cf.title")}</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.id} className="rounded-lg border p-3">
            <dt className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {f.name}{f.required && <span className="text-rose-500">*</span>}
            </dt>
            <dd>
              {!canEdit ? (
                <span className="text-sm">{f.type === "checkbox" ? (f.value === "true" ? "✓" : "—") : f.value || "—"}</span>
              ) : f.type === "select" ? (
                <select defaultValue={f.value} disabled={pending} onChange={(e) => save(f.id, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <input type="checkbox" defaultChecked={f.value === "true"} disabled={pending} onChange={(e) => save(f.id, e.target.checked ? "true" : "false")} className="h-5 w-5 accent-indigo-600" />
              ) : (
                <Input
                  type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                  defaultValue={f.value}
                  disabled={pending}
                  onBlur={(e) => e.target.value !== f.value && save(f.id, e.target.value)}
                  className="h-9"
                />
              )}
              <ErrorText code={err[f.id]} className="mt-1 text-xs text-destructive" />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
