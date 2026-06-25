"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Upload,
  FileSpreadsheet,
  Eye,
  Database,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import {
  previewImportAction,
  runImportAction,
  type ImportPreview,
  type ImportResult,
} from "@/actions/import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

const STATUS_COLOR: Record<string, string> = {
  Todo: "bg-sky-500",
  InProgress: "bg-amber-500",
  Done: "bg-emerald-500",
  Archived: "bg-slate-400",
};

const ERRORS: Record<string, TKey> = {
  NO_FILE: "import.selectFile",
  BAD_TYPE: "import.subtitle",
};

export function ImportClient() {
  const { t } = useT();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function fd() {
    const f = new FormData();
    if (file) f.append("file", file);
    return f;
  }

  function doPreview() {
    setResult(null);
    startTransition(async () => {
      const p = await previewImportAction({ ok: false }, fd());
      setPreview(p);
      if (!p.ok) toast(t(ERRORS[p.error ?? ""] ?? "import.subtitle"), "error");
    });
  }

  function doImport() {
    startTransition(async () => {
      const r = await runImportAction({ ok: false }, fd());
      setResult(r);
      if (r.ok) toast(t("import.done"));
      else toast(t(ERRORS[r.error ?? ""] ?? "import.subtitle"), "error");
    });
  }

  return (
    <div className="space-y-5">
      {/* Upload */}
      <Card>
        <CardContent className="p-5">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="me-1 h-4 w-4" />
              {t("import.selectFile")}
            </Button>
            {file && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            )}
            <div className="ms-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!file || pending}
                onClick={doPreview}
              >
                <Eye className="me-1 h-4 w-4" />
                {t("import.preview")}
              </Button>
              <Button
                type="button"
                disabled={!preview?.ok || pending}
                onClick={doImport}
              >
                <Database className="me-1 h-4 w-4" />
                {pending ? t("import.importing") : t("import.run")}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("import.idempotentHint")}
          </p>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview?.ok && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{preview.planName}</h2>
              {preview.alreadyImported! > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {preview.alreadyImported} {t("import.alreadyImported")}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t("projects.tasks"), value: preview.taskCount },
                { label: t("import.users"), value: preview.userCount },
                { label: t("import.buckets"), value: preview.bucketCount },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border bg-card p-3 text-center"
                >
                  <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* status breakdown bar */}
            <div>
              <div className="mb-1 flex h-3 w-full overflow-hidden rounded-full">
                {TASK_STATUSES.map((s) => {
                  const n = preview.statusBreakdown?.[s] ?? 0;
                  const pct = preview.taskCount
                    ? (n / preview.taskCount) * 100
                    : 0;
                  return pct > 0 ? (
                    <div
                      key={s}
                      className={STATUS_COLOR[s]}
                      style={{ width: `${pct}%` }}
                    />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {TASK_STATUSES.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${STATUS_COLOR[s]}`}
                    />
                    {t(`status.${s}` as TKey)}: {preview.statusBreakdown?.[s] ?? 0}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {TASK_PRIORITIES.map((p) => (
                <span key={p}>
                  {t(`priority.${p}` as TKey)}:{" "}
                  {preview.priorityBreakdown?.[p] ?? 0}
                </span>
              ))}
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("import.sample")}
              </p>
              <ul className="space-y-0.5 text-sm">
                {preview.sampleTitles?.map((tt, i) => (
                  <li key={i} className="truncate">
                    • {tt}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result?.ok && (
        <Card className="border-emerald-200">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{t("import.done")}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                <b className="tabular-nums">{result.tasksCreated}</b>{" "}
                {t("import.created")}
              </span>
              <span>
                <b className="tabular-nums">{result.tasksUpdated}</b>{" "}
                {t("import.updated")}
              </span>
              <span>
                <b className="tabular-nums">{result.usersCreated}</b>{" "}
                {t("import.users")}
              </span>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/tasks">
                {t("admin.tasks.title")}
                <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
