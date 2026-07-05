"use client";

import { useCallback, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

type Opt = { id: string; name: string };
type Kind = "tasks-excel" | "sprint-pdf" | "activity-pdf" | "kanban-pdf";
type GroupBy = "none" | "status" | "priority" | "project" | "assignee";

const KINDS: Kind[] = ["tasks-excel", "sprint-pdf", "activity-pdf", "kanban-pdf"];
const GROUPS: GroupBy[] = ["none", "status", "priority", "project", "assignee"];

type JobState = { id: string; status: string; downloadUrl: string | null; emailed: boolean; taskCount: number };

export function ExportDialog({
  hasLogo,
  projects,
  users,
  sprints,
  triggerVariant = "outline",
  triggerLabel,
}: {
  hasLogo: boolean;
  projects: Opt[];
  users: Opt[];
  sprints: Opt[];
  triggerVariant?: "outline" | "default" | "ghost";
  triggerLabel?: string;
}) {
  const { t, locale } = useT();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("tasks-excel");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [includeLogo, setIncludeLogo] = useState<boolean>(hasLogo);
  const [sprintId, setSprintId] = useState<string>(sprints[0]?.id ?? "");
  const [projectId, setProjectId] = useState<string>("");
  const [userId, setUserId] = useState<string>(users[0]?.id ?? "");
  const [activityDays, setActivityDays] = useState<string>("30");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (jobId: string, emailed: boolean, taskCount: number) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/export/jobs/${jobId}`, { cache: "no-store" });
          if (!r.ok) return;
          const j = await r.json();
          setJob({ id: jobId, status: j.status, downloadUrl: j.downloadUrl, emailed, taskCount });
          if (j.status === "done" || j.status === "error") stopPoll();
        } catch {
          /* keep polling */
        }
      }, 2000);
    },
    [stopPoll]
  );

  function buildBody() {
    const body: Record<string, unknown> = { kind, locale, includeLogo };
    if (kind === "tasks-excel") body.groupBy = groupBy;
    if (kind === "sprint-pdf") body.sprintId = sprintId || null;
    if (kind === "activity-pdf") {
      body.targetUserId = userId || null;
      body.activityDays = Number(activityDays) || 30;
    }
    if (kind === "kanban-pdf") body.projectId = projectId || null;
    return body;
  }

  async function generate() {
    setBusy(true);
    setJob(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });

      if (res.status === 202) {
        const j = await res.json();
        setJob({ id: j.jobId, status: "pending", downloadUrl: null, emailed: Boolean(j.emailed), taskCount: j.taskCount });
        poll(j.jobId, Boolean(j.emailed), j.taskCount);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || t("export.failed"), "error");
        return;
      }
      // Inline file → download from the blob.
      const blob = await res.blob();
      const fileName = parseFileName(res.headers.get("Content-Disposition")) || fallbackName(kind);
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);
      toast(t("export.download"));
    } catch {
      toast(t("export.failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const kindIcon = (k: Kind) =>
    k === "tasks-excel" ? <FileSpreadsheet className="h-4 w-4" /> : <FileText className="h-4 w-4" />;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          stopPoll();
          setJob(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          <Download className="me-1 h-4 w-4" />
          {triggerLabel ?? t("export.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("export.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Export kind */}
          <div className="space-y-2">
            <Label>{t("export.section.reports")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      {kindIcon(k)}
                      {t(`export.kind.${k}` as TKey)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`export.desc.${kind}` as TKey)}</p>
          </div>

          {/* Per-kind options */}
          {kind === "tasks-excel" && (
            <div className="space-y-2">
              <Label>{t("export.groupBy")}</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {t(`export.group.${g}` as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "sprint-pdf" && (
            <PickerSelect
              label={t("export.sprint.pick")}
              value={sprintId}
              onChange={setSprintId}
              options={sprints}
              emptyLabel={t("sprint.none")}
            />
          )}

          {kind === "activity-pdf" && (
            <>
              <PickerSelect
                label={t("export.user.pick")}
                value={userId}
                onChange={setUserId}
                options={users}
                emptyLabel={t("admin.users.title")}
              />
              <div className="space-y-2">
                <Label htmlFor="exp-days">{t("export.activityDays")}</Label>
                <input
                  id="exp-days"
                  type="number"
                  min={7}
                  max={365}
                  value={activityDays}
                  onChange={(e) => setActivityDays(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </>
          )}

          {kind === "kanban-pdf" && (
            <PickerSelect
              label={t("export.project.pick")}
              value={projectId}
              onChange={setProjectId}
              options={projects}
              emptyLabel={t("board.allProjects")}
              allowAll
              allLabel={t("board.allProjects")}
            />
          )}

          {/* Logo toggle (only when a tenant logo exists and the kind is a PDF) */}
          {hasLogo && kind !== "tasks-excel" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeLogo}
                onChange={(e) => setIncludeLogo(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              {t("export.includeLogo")}
            </label>
          )}

          {/* Async queued panel */}
          {job && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              {job.status !== "done" && job.status !== "error" && (
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4 animate-pulse" />
                  {t("export.queued.title")}
                </div>
              )}
              {job.status === "pending" || job.status === "processing" ? (
                <p className="mt-1 text-muted-foreground">
                  {t("export.queued.body", { n: job.taskCount })}{" "}
                  {job.emailed ? "" : t("export.queued.noEmail")}
                </p>
              ) : null}
              {job.status === "done" && job.downloadUrl && (
                <a
                  href={job.downloadUrl}
                  className="flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <Download className="h-4 w-4" />
                  {t("export.download")}
                </a>
              )}
              {job.status === "error" && <p className="text-destructive">{t("export.failed")}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Download className="me-1 h-4 w-4" />}
              {busy ? t("export.generating") : t("export.generate")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickerSelect({
  label,
  value,
  onChange,
  options,
  emptyLabel,
  allowAll,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  emptyLabel: string;
  allowAll?: boolean;
  allLabel?: string;
}) {
  const ALL = "__all__";
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value === "" && allowAll ? ALL : value}
        onValueChange={(v) => onChange(v === ALL ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={emptyLabel} />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value={ALL}>{allLabel ?? emptyLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function parseFileName(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : null;
}

function fallbackName(kind: Kind): string {
  return kind === "tasks-excel" ? "tasks.xlsx" : `${kind}.pdf`;
}
