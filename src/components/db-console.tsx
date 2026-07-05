"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Play, Download, Trash2 } from "lucide-react";
import { runQueryAction, purgeTenantAction, countTenantDataAction, type QueryResult, type AuditEntry, type TenantCounts } from "@/actions/db-admin";
import { classifyQuery } from "@/lib/sql-guard";
import { formatNumber } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TEMPLATES: { label: string; sql: string }[] = [
  { label: "Tasks per tenant", sql: 'SELECT t.slug, count(*) AS tasks\nFROM "Task" k JOIN "Tenant" t ON t.id = k."tenantId"\nGROUP BY t.slug ORDER BY tasks DESC;' },
  { label: "Tenants overview", sql: 'SELECT slug, name, "createdAt" FROM "Tenant" ORDER BY "createdAt";' },
  { label: "Users", sql: 'SELECT username, role, "tenantId" FROM "User" ORDER BY role;' },
  { label: "Recent tasks", sql: 'SELECT id, title, status, "createdAt" FROM "Task" ORDER BY "createdAt" DESC LIMIT 50;' },
  { label: "Preview: empty a tenant", sql: 'SELECT count(*) FROM "Task" WHERE "tenantId" = (SELECT id FROM "Tenant" WHERE slug = \'tarek\');' },
];

function csv(columns: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function DbConsole({ initialAudit }: { initialAudit: AuditEntry[] }) {
  const { locale } = useT();
  const [sql, setSql] = useState('SELECT t.slug, count(*) AS tasks\nFROM "Task" k JOIN "Tenant" t ON t.id = k."tenantId"\nGROUP BY t.slug ORDER BY tasks DESC;');
  const [writeMode, setWriteMode] = useState(false);
  const [res, setRes] = useState<QueryResult | null>(null);
  const [pending, start] = useTransition();
  const [audit, setAudit] = useState(initialAudit);

  const cls = classifyQuery(sql);

  function run() {
    start(async () => {
      const r = await runQueryAction(sql, writeMode);
      setRes(r);
    });
  }
  function exportCsv() {
    if (!res) return;
    const blob = new Blob([csv(res.columns, res.rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "query.csv";
    a.click();
  }

  return (
    <div className="space-y-5">
      {/* Editor */}
      <div className="rounded-xl border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <select aria-label="SQL templates" onChange={(e) => e.target.value && setSql(e.target.value)} value="" className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="">Templates…</option>
            {TEMPLATES.map((tpl) => <option key={tpl.label} value={tpl.sql}>{tpl.label}</option>)}
          </select>
          <label className="ms-auto flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={writeMode} onChange={(e) => setWriteMode(e.target.checked)} className="h-4 w-4 accent-rose-600" />
            <span className={cn(writeMode && "font-semibold text-rose-600 dark:text-rose-400")}>Write mode</span>
          </label>
          <Button size="sm" onClick={run} disabled={pending} variant={cls.dangerous ? "destructive" : "default"}>
            <Play className="me-1 h-4 w-4" /> Run
          </Button>
        </div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={6}
          aria-label="SQL query"
          className="w-full resize-y bg-background p-3 font-mono text-sm outline-none"
        />
        {cls.dangerous && (
          <div className="flex items-center gap-2 border-t bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Mutating/DDL query ({cls.firstWord}) — requires <b>Write mode</b>. This changes data.
          </div>
        )}
      </div>

      {/* Result */}
      {res && (
        <div className="rounded-xl border">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs">
            {res.error ? (
              <span className="font-medium text-destructive">Error: {res.error}</span>
            ) : (
              <span>{res.mode === "read" ? `${formatNumber(res.rowCount, locale, 0)} rows` : `${formatNumber(res.rowCount, locale, 0)} affected`}{res.truncated ? " (showing first 1000)" : ""}</span>
            )}
            {res.rows.length > 0 && (
              <Button size="sm" variant="outline" className="ms-auto" onClick={exportCsv}>
                <Download className="me-1 h-4 w-4" /> CSV
              </Button>
            )}
          </div>
          {res.rows.length > 0 && (
            <div className="max-h-96 overflow-auto" tabIndex={0} role="region" aria-label="Query results">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary">
                  <tr>{res.columns.map((c) => <th key={c} className="border-b p-2 text-start font-semibold">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {res.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      {row.map((cell, j) => <td key={j} className="border-b p-2 align-top font-mono">{String(cell ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <PurgeTenant />

      {/* Audit */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Audit log (last 40)</h2>
        <div className="max-h-60 overflow-auto rounded-lg border text-xs" tabIndex={0} role="region" aria-label="Audit log">
          {audit.length === 0 ? <p className="p-3 text-muted-foreground">No queries yet.</p> : (
            <ul className="divide-y">
              {audit.map((a) => (
                <li key={a.id} className="flex items-start gap-2 p-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", a.mode === "read" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : a.mode === "purge" ? "bg-rose-200 text-rose-800 dark:bg-rose-500/30 dark:text-rose-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300")}>{a.mode}</span>
                  <code className="min-w-0 flex-1 truncate" title={a.sql}>{a.sql}</code>
                  <span className="shrink-0 text-muted-foreground">{a.error ? "✗" : a.rowCount ?? ""} · {a.userName} · {new Date(a.createdAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const ERR: Record<string, TKey> = { CONFIRM_MISMATCH: "error.confirmMismatch", NOT_FOUND: "error.notFound", FORBIDDEN: "error.forbidden" };

function PurgeTenant() {
  const { t } = useT();
  const [slug, setSlug] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [counts, setCounts] = useState<TenantCounts>(null);

  // live preview of how much data the purge would remove
  function preview(s: string) {
    setSlug(s);
    setCounts(null);
    if (s) start(async () => setCounts(await countTenantDataAction(s)));
  }

  return (
    <div className="rounded-xl border-2 border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-300">
        <Trash2 className="h-4 w-4" /> {t("db.danger.title")}
      </h2>
      <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">{t("db.danger.desc")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input value={slug} onChange={(e) => preview(e.target.value)} aria-label={t("db.danger.slug")} placeholder={t("db.danger.slug")} className="w-48" title={t("db.danger.slug")} />
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={t("db.danger.reconfirm")} placeholder={t("db.danger.reconfirm")} className="w-48" title={t("db.danger.reconfirm")} />
        <Button
          size="sm"
          variant="destructive"
          title={t("db.danger.button")}
          disabled={pending || !slug || confirm !== slug}
          onClick={() => start(async () => {
            const r = await purgeTenantAction(slug, confirm);
            setMsg(r.ok ? `✓ ${r.summary}` : `✗ ${t(ERR[r.error ?? ""] ?? "error.notFound")}`);
            setSlug(""); setConfirm(""); setCounts(null);
          })}
        >
          {t("db.danger.button")}
        </Button>
      </div>
      {counts && (counts.tasks + counts.projects + counts.teams + counts.sprints > 0) && (
        <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
          ⚠ {t("db.danger.willRemove")} {counts.tasks} Tasks · {counts.projects} Projekte · {counts.teams} Teams · {counts.sprints} Sprints — <b>{counts.name}</b>
        </p>
      )}
      {msg && <p className="mt-2 text-xs font-medium">{msg}</p>}
    </div>
  );
}
