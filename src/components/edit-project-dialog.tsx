"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateProjectAction } from "@/actions/projects";
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
import { AFFILIATIONS, type Affiliation } from "@/lib/project-visibility/policy";
import { useAffiliationLabel } from "@/components/display-level";

/** Admin-only rename/edit for a project (name + description). */
export function EditProjectDialog({
  projectId,
  name,
  description,
  affiliation,
}: {
  projectId: string;
  name: string;
  description: string | null;
  affiliation: Affiliation;
}) {
  const { t } = useT();
  const label = useAffiliationLabel();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, description: description ?? "", affiliation: affiliation as string });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setForm({ name, description: description ?? "", affiliation });
          setErr(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="me-1 h-4 w-4" />
          {t("project.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.edit")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-project-name">{t("projects.name")} *</Label>
            <Input
              id="edit-project-name"
              value={form.name}
              maxLength={120}
              autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-project-desc">{t("projects.description")}</Label>
            <Textarea
              id="edit-project-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {/* TOF-0967 */}
          <div className="space-y-2">
            <Label htmlFor="edit-project-affiliation">{t("project.affiliation")}</Label>
            <select
              id="edit-project-affiliation"
              data-testid="edit-project-affiliation"
              value={form.affiliation}
              onChange={(e) => setForm({ ...form, affiliation: e.target.value })}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {AFFILIATIONS.map((a) => (
                <option key={a} value={a}>
                  {label(a)}
                </option>
              ))}
            </select>
          </div>
          {err && (
            <p className="text-sm font-medium text-destructive">
              {t((err === "EMPTY_NAME" ? "users.err.EMPTY_NAME" : "users.err.ERR") as Parameters<typeof t>[0])}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("project.delete.cancel")}
            </Button>
            <Button
              disabled={pending || !form.name.trim()}
              onClick={() =>
                start(async () => {
                  const res = await updateProjectAction(projectId, form).catch(() => ({ error: "ERR" }));
                  if (res.error) {
                    setErr(res.error);
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("task.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
