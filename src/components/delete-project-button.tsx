"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";
import {
  deleteProjectAction,
  getProjectDeleteStats,
} from "@/actions/projects";

/**
 * Admin-only project delete with the Airtable confirmation pattern: the
 * dialog shows what will go (task/comment/attachment counts) and only
 * enables the red button once the admin typed the project name verbatim.
 * The delete itself is a SOFT delete (restorable from the deleted page).
 */
export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<{ tasks: number; comments: number; attachments: number } | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  function openDialog() {
    setTyped("");
    setOpen(true);
    getProjectDeleteStats(projectId).then(setStats).catch(() => setStats({ tasks: 0, comments: 0, attachments: 0 }));
  }

  const confirmed = typed.trim() === projectName.trim();

  return (
    <>
      <Button variant="destructive" onClick={openDialog}>
        <Trash2 className="me-1 h-4 w-4" />
        {t("project.delete")}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button
            aria-label={t("nav.close")}
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <TriangleAlert className="h-5 w-5 text-destructive" />
                {t("project.delete.title")}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("nav.close")}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              {t("project.delete.text")
                .replace("{name}", projectName)
                .replace("{tasks}", String(stats?.tasks ?? "…"))
                .replace("{comments}", String(stats?.comments ?? "…"))
                .replace("{attachments}", String(stats?.attachments ?? "…"))}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{t("project.delete.softHint")}</p>

            <p className="mb-1 mt-4 text-sm font-medium">
              {t("project.delete.typeName").replace("{name}", projectName)}
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={projectName}
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("project.delete.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={!confirmed || pending}
                onClick={() => start(async () => deleteProjectAction(projectId))}
              >
                {pending ? (
                  <Loader2 className="me-1 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="me-1 h-4 w-4" />
                )}
                {t("project.delete.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
