"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { createTeamAction } from "@/actions/teams";
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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";

const COLORS = [
  "#0ea5e9",
  "#14b8a6",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#22c55e",
  "#ec4899",
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function NewTeamDialog() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [state, formAction] = useFormState(createTeamAction, {});

  useEffect(() => {
    if (!open) setColor(COLORS[0]);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="me-1 h-4 w-4" />
          {t("teams.new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("teams.new")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("teams.name")} *</Label>
            <Input id="name" name="name" required autoFocus maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("teams.description")}</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="space-y-2">
            <Label>{t("teams.color")}</Label>
            <input type="hidden" name="color" value={color} />
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${color === c ? "border-foreground" : "border-transparent"}`}
                  style={{
                    backgroundColor: c,
                    transform: color === c ? "scale(1.1)" : "scale(1)",
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {state.error && (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end">
            <Submit label={t("teams.create")} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
