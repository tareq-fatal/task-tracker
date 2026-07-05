"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { createTenantAction } from "@/actions/tenants";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

export function TenantWizard() {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: "", slug: "", primaryColor: "#4f46e5", ownerName: "", ownerUsername: "", ownerEmail: "", ownerPassword: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await createTenantAction(f);
      if (r.ok) {
        setMsg({ ok: true, text: `✓ /${r.slug}` });
        // auto-switched server-side → land in the new tenant to set it up
        router.push("/");
        router.refresh();
      } else {
        setMsg({ ok: false, text: `✗ ${r.error}` });
      }
    });
  }

  const canSubmit = f.name.trim() && f.slug.trim() && f.ownerName.trim() && f.ownerUsername.trim() && f.ownerEmail.trim() && f.ownerPassword.length >= 6;

  return (
    <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-indigo-700 dark:text-indigo-300">
        <Building2 className="h-4 w-4" /> {t("tenants.new")}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tw-name">{t("tenants.name")}</Label>
          <Input id="tw-name" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value, slug: s.slug || slugify(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tw-slug">{t("tenants.slug")}</Label>
          <Input id="tw-slug" value={f.slug} onChange={(e) => setF((s) => ({ ...s, slug: slugify(e.target.value) }))} placeholder="acme" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tw-color">{t("tenants.color")}</Label>
          <input id="tw-color" type="color" value={f.primaryColor} onChange={set("primaryColor")} className="h-9 w-16 cursor-pointer rounded border bg-transparent p-0.5" />
        </div>
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-indigo-700/70 dark:text-indigo-300/70">{t("tenants.owner")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="tw-oname">{t("tenants.ownerName")}</Label><Input id="tw-oname" value={f.ownerName} onChange={(e) => setF((s) => ({ ...s, ownerName: e.target.value, ownerUsername: s.ownerUsername || slugify(e.target.value) }))} /></div>
        <div className="space-y-1"><Label htmlFor="tw-ouser">{t("tenants.ownerUsername")}</Label><Input id="tw-ouser" value={f.ownerUsername} onChange={set("ownerUsername")} /></div>
        <div className="space-y-1"><Label htmlFor="tw-oemail">{t("tenants.ownerEmail")}</Label><Input id="tw-oemail" type="email" value={f.ownerEmail} onChange={set("ownerEmail")} /></div>
        <div className="space-y-1"><Label htmlFor="tw-opass">{t("tenants.ownerPassword")}</Label><Input id="tw-opass" type="text" value={f.ownerPassword} onChange={set("ownerPassword")} placeholder="min. 6" /></div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !canSubmit}><Check className="me-1 h-4 w-4" /> {t("tenants.create")}</Button>
        {msg && <span className={msg.ok ? "text-sm font-medium text-emerald-600 dark:text-emerald-400" : "text-sm font-medium text-destructive"}>{msg.text}</span>}
      </div>
    </div>
  );
}
