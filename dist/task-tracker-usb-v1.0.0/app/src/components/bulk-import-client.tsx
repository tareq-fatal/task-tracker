"use client";

import { useRef, useState, useTransition } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileDown,
  Eye,
  Database,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  ListChecks,
  Users,
  FolderKanban,
} from "lucide-react";
import {
  previewBulkImportAction,
  runBulkImportAction,
  type BulkPreview,
  type BulkResult,
} from "@/actions/bulk-import";
import type { ImportEntity, RowReport, RowIssue } from "@/lib/bulk-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

const MAX_RENDERED_ROWS = 300;

const ENTITIES: { key: ImportEntity; label: TKey; icon: React.ElementType }[] = [
  { key: "tasks", label: "bulkImport.entity.tasks", icon: ListChecks },
  { key: "users", label: "bulkImport.entity.users", icon: Users },
  { key: "projects", label: "bulkImport.entity.projects", icon: FolderKanban },
];

const STATUS_STYLE: Record<RowReport["status"], string> = {
  create: "bg-emerald-100 text-emerald-700",
  skip: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<RowReport["status"], TKey> = {
  create: "bulkImport.create",
  skip: "bulkImport.skip",
  error: "bulkImport.error",
};

/** File-level errors → i18n keys. */
const FILE_ERRORS: Record<string, TKey> = {
  NO_FILE: "bulkImport.file.NO_FILE",
  BAD_TYPE: "bulkImport.file.BAD_TYPE",
  TOO_LARGE: "bulkImport.file.TOO_LARGE",
  EMPTY: "bulkImport.file.EMPTY",
  MISSING_COLUMNS: "bulkImport.file.MISSING_COLUMNS",
  TOO_MANY_ROWS: "bulkImport.file.TOO_MANY_ROWS",
  HAS_ERRORS: "bulkImport.hasErrors",
  NOTHING_TO_IMPORT: "bulkImport.nothingToImport",
  WRITE_FAILED: "bulkImport.rollback",
  FORBIDDEN: "error.forbidden",
};

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function BulkImportClient() {
  const { t } = useT();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>("tasks");
  const [file, setFile] = useState<File | null>(null);
  const [skipErrors, setSkipErrors] = useState(true);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();

  function issueText(i: RowIssue): string {
    const base = t(`bulkImport.err.${i.code}` as TKey);
    const col = i.column ? ` (${i.column}${i.value ? `: ${i.value}` : ""})` : "";
    return base + col;
  }

  function reset() {
    setPreview(null);
    setResult(null);
  }

  function selectEntity(e: ImportEntity) {
    setEntity(e);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    reset();
  }

  function fd() {
    const f = new FormData();
    f.append("entity", entity);
    if (file) f.append("file", file);
    if (skipErrors) f.append("skipErrors", "1");
    return f;
  }

  function fileError(code: string | undefined, missing?: string[]): string {
    const msg = t(FILE_ERRORS[code ?? ""] ?? "bulkImport.file.BAD_TYPE");
    return missing?.length ? `${msg}: ${missing.join(", ")}` : msg;
  }

  function doPreview() {
    setResult(null);
    startTransition(async () => {
      const p = await previewBulkImportAction({ ok: false }, fd());
      setPreview(p);
      if (!p.ok) toast(fileError(p.error, p.missingColumns), "error");
    });
  }

  function doImport() {
    startTransition(async () => {
      const r = await runBulkImportAction({ ok: false }, fd());
      setResult(r);
      if (r.ok) toast(t("bulkImport.done"));
      else toast(fileError(r.error), "error");
    });
  }

  function downloadErrorReport() {
    const rows = (preview?.rows ?? []).filter((r) => r.status !== "create");
    const lines = [
      ["Row", "Label", "Status", "Issues"].join(","),
      ...rows.map((r) =>
        [
          String(r.sheetRow),
          csvCell(r.label),
          r.status,
          csvCell(r.issues.map(issueText).join("; ")),
        ].join(",")
      ),
    ];
    downloadBlob(lines.join("\r\n"), `import-report-${entity}.csv`, "text/csv;charset=utf-8");
  }

  function downloadCredentials() {
    const creds = result?.credentials ?? [];
    const lines = [
      ["Username", "TempPassword"].join(","),
      ...creds.map((c) => [csvCell(c.username), csvCell(c.password)].join(",")),
    ];
    downloadBlob(lines.join("\r\n"), "temp-passwords.csv", "text/csv;charset=utf-8");
  }

  const rows = preview?.rows ?? [];
  const rendered = rows.slice(0, MAX_RENDERED_ROWS);
  const canImport =
    !!preview?.ok &&
    (preview.createCount ?? 0) > 0 &&
    ((preview.errorCount ?? 0) === 0 || skipErrors);

  return (
    <div className="space-y-5">
      {/* Entity selection + template download */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2">
            {ENTITIES.map((e) => {
              const Icon = e.icon;
              const active = entity === e.key;
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => selectEntity(e.key)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition-all",
                    active
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "text-muted-foreground hover:bg-secondary/70"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-indigo-600")} />
                  {t(e.label)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("bulkImport.templateHint")}
            </span>
            <div className="ms-auto flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/bulk-import/template?entity=${entity}&format=xlsx`}>
                  <FileDown className="me-1 h-4 w-4" />
                  {t("bulkImport.templateXlsx")}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/bulk-import/template?entity=${entity}&format=csv`}>
                  <FileDown className="me-1 h-4 w-4" />
                  {t("bulkImport.templateCsv")}
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload + actions */}
      <Card>
        <CardContent className="p-5">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="me-1 h-4 w-4" />
              {t("bulkImport.selectFile")}
            </Button>
            {file && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
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
                {t("bulkImport.preview")}
              </Button>
              <Button type="button" disabled={!canImport || pending} onClick={doImport}>
                <Database className="me-1 h-4 w-4" />
                {pending ? t("bulkImport.importing") : t("bulkImport.run")}
              </Button>
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipErrors}
              onChange={(e) => setSkipErrors(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t("bulkImport.skipErrors")}
            <span className="text-xs text-muted-foreground">
              — {t("bulkImport.strictHint")}
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview?.ok && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: t("bulkImport.rows"), value: preview.total, cls: "" },
                { label: t("bulkImport.create"), value: preview.createCount, cls: "text-emerald-600" },
                { label: t("bulkImport.skip"), value: preview.skipCount, cls: "text-amber-600" },
                { label: t("bulkImport.error"), value: preview.errorCount, cls: "text-red-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border bg-card p-3 text-center">
                  <div className={cn("text-2xl font-bold tabular-nums", s.cls)}>
                    {s.value}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {(preview.skipCount ?? 0) + (preview.errorCount ?? 0) > 0 && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={downloadErrorReport}>
                  <FileDown className="me-1 h-4 w-4" />
                  {t("bulkImport.downloadErrors")}
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50 text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-start">{t("bulkImport.row")}</th>
                    <th className="px-3 py-2 text-start">{t("bulkImport.label")}</th>
                    <th className="px-3 py-2 text-start">Status</th>
                    <th className="px-3 py-2 text-start">{t("bulkImport.issues")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rendered.map((r) => (
                    <tr key={r.sheetRow} className="border-b last:border-0">
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                        {r.sheetRow}
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-1.5">{r.label}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_STYLE[r.status]
                          )}
                        >
                          {t(STATUS_LABEL[r.status])}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {r.issues.map(issueText).join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > MAX_RENDERED_ROWS && (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  +{rows.length - MAX_RENDERED_ROWS} {t("bulkImport.truncated")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aborted import (strict mode) */}
      {result && !result.ok && result.error === "HAS_ERRORS" && (
        <Card className="border-red-200">
          <CardContent className="flex items-center gap-2 p-5 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {t("bulkImport.hasErrors")}
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result?.ok && (
        <Card className="border-emerald-200">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{t("bulkImport.done")}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                <b className="tabular-nums">{result.created}</b>{" "}
                {t("bulkImport.createdCount")}
              </span>
              <span>
                <b className="tabular-nums">{result.skipped}</b>{" "}
                {t("bulkImport.skippedCount")}
              </span>
              {(result.errors ?? 0) > 0 && (
                <span className="text-red-600">
                  <b className="tabular-nums">{result.errors}</b>{" "}
                  {t("bulkImport.errorCount")}
                </span>
              )}
            </div>

            {result.credentials && result.credentials.length > 0 && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <KeyRound className="h-4 w-4" />
                  {t("bulkImport.credentials")}
                </div>
                <p className="text-xs text-amber-700">
                  {t("bulkImport.credentialsHint")}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadCredentials}>
                  <FileDown className="me-1 h-4 w-4" />
                  {t("bulkImport.downloadCredentials")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
