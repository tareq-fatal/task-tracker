"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFieldValueAction } from "@/actions/custom-fields";
import { displayValue, type FieldType } from "@/lib/custom-fields";
import { useT } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";

export type TaskField = { id: string; name: string; type: FieldType; options: string[]; required: boolean; value: string };
type UserOpt = { id: string; name: string };

export function TaskCustomFields({
  taskId, fields, users, canEdit,
}: {
  taskId: string;
  fields: TaskField[];
  users: UserOpt[];
  canEdit: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<Record<string, string>>({});
  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

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
                <span className="text-sm">{displayValue(f.type, f.value, userNames)}</span>
              ) : f.type === "select" ? (
                <select defaultValue={f.value} disabled={pending} onChange={(e) => save(f.id, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "user" ? (
                <select defaultValue={f.value} disabled={pending} onChange={(e) => save(f.id, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">—</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
              {err[f.id] && <p className="mt-1 text-xs text-destructive">{err[f.id]}</p>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
