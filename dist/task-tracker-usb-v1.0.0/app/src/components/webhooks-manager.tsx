"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Send,
  RefreshCw,
  ScrollText,
  Webhook as WebhookIcon,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import {
  addWebhookAction,
  toggleWebhookAction,
  deleteWebhookAction,
  rotateSecretAction,
  sendTestAction,
  getDeliveries,
  type WebhookLite,
  type DeliveryLite,
} from "@/actions/webhooks";
import { WEBHOOK_EVENTS, WEBHOOK_PRESETS } from "@/lib/webhooks";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESET_HINTS: Record<string, string> = {
  slack: "Slack → Incoming Webhooks → paste the hooks.slack.com URL",
  teams: "Teams → Connectors → Incoming Webhook → paste the office.com URL",
  discord: "Discord → Channel → Integrations → Webhooks → Copy URL",
  generic: "Any HTTPS endpoint. Verify X-Webhook-Signature (sha256 HMAC).",
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
    success: { cls: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
    failed: { cls: "bg-rose-100 text-rose-700", Icon: XCircle },
    pending: { cls: "bg-amber-100 text-amber-700", Icon: Clock },
  };
  const { cls, Icon } = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<DeliveryLite[] | null>(null);
  const [loading, start] = useTransition();

  function load() {
    start(async () => setRows(await getDeliveries(webhookId)));
  }
  // lazy-load once when the log is first opened
  useEffect(() => {
    start(async () => setRows(await getDeliveries(webhookId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookId]);

  if (loading && rows === null) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">…</p>;
  }
  if (!rows || rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">{t("webhook.noDeliveries")}</p>;
  }
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-start font-medium">event</th>
            <th className="px-2 py-1 text-start font-medium">status</th>
            <th className="px-2 py-1 text-start font-medium">HTTP</th>
            <th className="px-2 py-1 text-start font-medium">{t("webhook.attempts")}</th>
            <th className="px-2 py-1 text-start font-medium">time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-t align-top">
              <td className="px-2 py-1 font-mono">{d.event}</td>
              <td className="px-2 py-1"><StatusPill status={d.status} /></td>
              <td className="px-2 py-1">{d.statusCode ?? "—"}</td>
              <td className="px-2 py-1">{d.attempts}</td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {new Date(d.createdAt).toLocaleString()}
                {d.error && <div className="max-w-xs truncate text-rose-500" title={d.error}>{d.error}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={load} className="m-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <RefreshCw className="h-3 w-3" /> refresh
      </button>
    </div>
  );
}

export function WebhooksManager({ initial }: { initial: WebhookLite[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [preset, setPreset] = useState<string>("generic");
  const [events, setEvents] = useState<string[]>(["task.created"]);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [openLog, setOpenLog] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setErr(r.error ?? "");
      router.refresh();
    });

  function toggleEvent(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function add() {
    setNotice("");
    if (!name.trim()) return;
    if (events.length === 0) { setErr(t("webhook.needEvents")); return; }
    run(async () => {
      const r = await addWebhookAction(name, url, events, preset);
      if (r.ok) { setName(""); setUrl(""); setEvents(["task.created"]); setPreset("generic"); }
      return r;
    });
  }

  function test(id: string) {
    setNotice("");
    start(async () => {
      const r = await sendTestAction(id);
      setNotice(r.ok ? t("webhook.testSent") : `${t("webhook.testFailed")}: ${r.error ?? ""}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("webhook.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {initial.map((w) => (
            <li key={w.id} className="rounded-lg border bg-card p-3" data-testid="webhook-row">
              <div className="flex flex-wrap items-center gap-2">
                <WebhookIcon className="h-4 w-4 text-sky-500" />
                <span className="font-medium">{w.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase">{w.preset}</span>
                <label className="ms-auto flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={w.enabled}
                    onChange={(e) => run(() => toggleWebhookAction(w.id, e.target.checked))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  {t("webhook.enabled")}
                </label>
              </div>

              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{w.url}</div>

              <div className="mt-2 flex flex-wrap gap-1">
                {w.events.map((e) => (
                  <span key={e} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{e}</span>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{t("webhook.secret")}: <span className="font-mono">{w.secretMasked}</span></span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={pending} onClick={() => test(w.id)}>
                  <Send className="me-1 h-3.5 w-3.5" /> {t("webhook.test")}
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => rotateSecretAction(w.id))}>
                  <RefreshCw className="me-1 h-3.5 w-3.5" /> {t("webhook.rotate")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenLog(openLog === w.id ? null : w.id)}
                >
                  <ScrollText className="me-1 h-3.5 w-3.5" /> {openLog === w.id ? t("webhook.hideLog") : t("webhook.log")}
                </Button>
                <button
                  disabled={pending}
                  title={t("webhook.delete")}
                  onClick={() => run(() => deleteWebhookAction(w.id))}
                  className="ms-auto rounded p-1.5 text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {openLog === w.id && (
                <div className="mt-3 rounded-md border bg-background">
                  <DeliveryLog webhookId={w.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="text-sm font-medium text-emerald-600">{notice}</p>}

      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("webhook.name")} className="w-full max-w-xs" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("webhook.url")} className="w-full max-w-md flex-1" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{t("webhook.preset")}</span>
          <select
            aria-label={t("webhook.preset")}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="h-9 rounded-md border bg-background px-2"
          >
            {WEBHOOK_PRESETS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{PRESET_HINTS[preset]}</span>
        </div>

        <div>
          <span className="text-sm font-semibold">{t("webhook.events")}</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {WEBHOOK_EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(e)}
                  onChange={() => toggleEvent(e)}
                  className="h-4 w-4 accent-sky-600"
                />
                <span className="font-mono text-xs">{e}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={add} disabled={pending || !name.trim() || !url.trim()}>
            <Plus className="me-1 h-4 w-4" /> {t("webhook.add")}
          </Button>
          {err && <span className="text-xs font-medium text-destructive">{err}</span>}
        </div>
      </div>
    </div>
  );
}
