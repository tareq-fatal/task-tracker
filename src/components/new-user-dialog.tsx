"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { createUserAction } from "@/actions/users";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
import { ROLES } from "@/lib/enums";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function NewUserDialog() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createUserAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Close & reset on success — BUT keep open to show a generated temp password.
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current && !state.error && !state.tempPassword) {
      setOpen(false);
      formRef.current?.reset();
    }
    submitted.current = false;
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="me-1 h-4 w-4" />
          {t("admin.users.new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.users.new")}</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          action={(fd) => {
            submitted.current = true;
            formAction(fd);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">{t("admin.users.name")} *</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="username">{t("login.username")} *</Label>
              <Input id="username" name="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">{t("admin.users.role")}</Label>
              <select id="role" name="role" className={selectClass} defaultValue="User">
                {ROLES.filter((r) => r !== "BackendAdmin").map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("admin.users.email")}</Label>
            <Input id="email" name="email" type="email" placeholder={t("admin.users.optional")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input id="password" name="password" type="text" minLength={6} placeholder={t("admin.users.passwordOptional")} />
            <p className="text-xs text-muted-foreground">{t("admin.users.passwordHint")}</p>
          </div>
          {state.error && (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          )}
          {state.tempPassword ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <p className="mb-1 font-semibold text-emerald-800 dark:text-emerald-300">
                {t("admin.users.tempCreated")}
              </p>
              <p className="text-emerald-900 dark:text-emerald-200">
                @{state.createdUsername} · <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono dark:bg-black/30">{state.tempPassword}</code>
              </p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                {t("admin.users.tempHint")}
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    formRef.current?.reset();
                  }}
                >
                  {t("common.done")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Submit label={t("admin.users.create")} />
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
