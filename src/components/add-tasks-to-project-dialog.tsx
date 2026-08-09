"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import { addTasksToProjectAction } from "@/actions/projects";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";

export type TaskCandidate = {
  id: string;
  title: string;
  /** Current project name, when the task already belongs to another project. */
  projectName: string | null;
};

/** Admin picker on the project page: attach EXISTING tasks to this project. */
export function AddTasksToProjectDialog({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: TaskCandidate[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((c) => c.title.toLowerCase().includes(needle));
  }, [candidates, q]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQ("");
          setPicked(new Set());
          setErr(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ListPlus className="me-1 h-4 w-4" />
          {t("project.addTasks")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.addTasks")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("project.addTasks.empty")}</p>
          ) : (
            <>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("common.search")}
              />
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {shown.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">{t("project.addTasks.empty")}</p>
                ) : (
                  shown.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {c.projectName && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {c.projectName}
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </>
          )}
          {err && <p className="text-sm font-medium text-destructive">{t("users.err.ERR")}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("project.delete.cancel")}
            </Button>
            <Button
              disabled={pending || picked.size === 0}
              onClick={() =>
                start(async () => {
                  const res = await addTasksToProjectAction(projectId, [...picked]).catch(() => ({ error: "ERR" as const }));
                  if (res.error) {
                    setErr(res.error);
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("project.addTasks.submit", { n: String(picked.size) })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
