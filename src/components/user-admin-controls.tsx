"use client";

import { useState, useTransition } from "react";
import { KeyRound, Pencil, UserX, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";
import {
  updateUserBasicAction,
  setUserActiveAction,
  resetUserPasswordAction,
  changeUserRoleAction,
} from "@/actions/users";

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
  role: string;
  deactivated: boolean;
};

/**
 * Per-user management controls in the admin user list.
 *  - editable: actor may edit THIS user (canEditUserTarget, server-enforced)
 *  - canDeactivate / canReactivate / canChangeRole: per the SubAdmin rules
 *    (reactivate + role changes are admin-only; role options come from
 *    assignableRoles of the actor)
 */
export function UserAdminControls({
  user,
  editable,
  canReactivate,
  roleOptions,
}: {
  user: UserRow;
  editable: boolean;
  canReactivate: boolean;
  roleOptions: string[];
}) {
  const { t } = useT();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: user.name,
    email: user.email ?? "",
    phone: user.phone ?? "",
    locale: user.locale,
  });
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editable && !canReactivate) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* role change — admin-level only (options empty for sub-admins) */}
      {editable && roleOptions.length > 0 && (
        <select
          value={user.role}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              await changeUserRoleAction(user.id, e.target.value).catch(() => {});
            })
          }
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
          title={t("users.roleChange")}
        >
          {[user.role, ...roleOptions.filter((r) => r !== user.role)].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}

      {editable && (
        <Button variant="ghost" size="icon" title={t("users.edit")} onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}

      {editable && (
        <Button
          variant="ghost"
          size="icon"
          title={t("users.resetPw")}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await resetUserPasswordAction(user.id).catch(() => null);
              if (res?.tempPassword) setTempPw(res.tempPassword);
            })
          }
        >
          <KeyRound className="h-4 w-4" />
        </Button>
      )}

      {user.deactivated
        ? canReactivate && (
            <Button
              variant="ghost"
              size="icon"
              className="text-emerald-600"
              title={t("users.reactivate")}
              disabled={pending}
              onClick={() => start(async () => { await setUserActiveAction(user.id, true).catch(() => {}); })}
            >
              <UserCheck className="h-4 w-4" />
            </Button>
          )
        : editable && (
            <Button
              variant="ghost"
              size="icon"
              className="text-amber-600"
              title={t("users.deactivate")}
              disabled={pending}
              onClick={() => start(async () => { await setUserActiveAction(user.id, false).catch(() => {}); })}
            >
              <UserX className="h-4 w-4" />
            </Button>
          )}

      {tempPw && (
        <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-700">
          {t("users.tempPwIs")}: {tempPw}
        </span>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button aria-label={t("nav.close")} className="absolute inset-0 bg-black/50" onClick={() => setEditOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("users.edit")} — {user.name}</h2>
              <button onClick={() => setEditOpen(false)} aria-label={t("nav.close")} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("users.name")} />
              <Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t("users.phone")} />
              <select
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="ar">العربية</option>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </select>
              {err && <p className="text-xs text-destructive">{err}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>{t("project.delete.cancel")}</Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await updateUserBasicAction(user.id, form).catch(() => ({ error: "ERR" }));
                      if (res.error) setErr(res.error);
                      else setEditOpen(false);
                    })
                  }
                >
                  {t("task.save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
