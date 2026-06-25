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

  // Close & reset when a submit succeeds (no error returned)
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current && !state.error) {
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
                {ROLES.filter((r) => r !== "SuperAdmin").map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("login.password")} *</Label>
            <Input id="password" name="password" type="text" required minLength={6} />
          </div>
          {state.error && (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end">
            <Submit label={t("admin.users.create")} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
