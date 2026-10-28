"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { saveLeadAction, type LeadFormState } from "@/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";
import { LEAD_LIMITS, LEAD_STATUSES } from "@/lib/leads";
import type { TKey } from "@/lib/i18n";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type LeadFormValues = {
  id: string;
  company: string;
  contact: string;
  channel: string;
  status: string;
  nextAction: string;
  nextActionAt: string; // yyyy-MM-dd
  notes: string;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

/** Lead anlegen/bearbeiten (TOF-0782, Tarek 28.10.2026). */
export function LeadForm({
  projectId,
  lead,
  cancelHref,
}: {
  projectId: string;
  lead?: LeadFormValues;
  /** Bearbeiten: zurück zur Liste (ohne ?edit=). */
  cancelHref: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState<LeadFormState, FormData>(saveLeadAction, {});

  useEffect(() => {
    if (!state.ok) return;
    if (lead) router.push(cancelHref);
    else formRef.current?.reset();
  }, [state, lead, router, cancelHref]);

  const errKey = state.error
    ? ((["COMPANY_REQUIRED", "BAD_STATUS", "BAD_DATE", "TOO_LONG", "NOT_FOUND"].includes(state.error)
        ? `leads.err.${state.error}`
        : "leads.err.NOT_FOUND") as TKey)
    : null;

  return (
    <form ref={formRef} action={formAction} className="space-y-4" data-testid="lead-form">
      <input type="hidden" name="projectId" value={projectId} />
      {lead && <input type="hidden" name="leadId" value={lead.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-company">{t("leads.company")} *</Label>
          <Input id="lead-company" name="company" required maxLength={LEAD_LIMITS.company} defaultValue={lead?.company} dir="auto" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-contact">{t("leads.contact")}</Label>
          <Input id="lead-contact" name="contact" maxLength={LEAD_LIMITS.contact} defaultValue={lead?.contact} dir="auto" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-channel">{t("leads.channel")}</Label>
          <Input id="lead-channel" name="channel" maxLength={LEAD_LIMITS.channel} defaultValue={lead?.channel} dir="auto" placeholder={t("leads.channelPlaceholder")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-status">{t("leads.status")}</Label>
          <select id="lead-status" name="status" defaultValue={lead?.status ?? "New"} className={selectClass}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`leads.status.${s}` as TKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-nextAction">{t("leads.nextAction")}</Label>
          <Input id="lead-nextAction" name="nextAction" maxLength={LEAD_LIMITS.nextAction} defaultValue={lead?.nextAction} dir="auto" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-nextActionAt">{t("leads.nextActionAt")}</Label>
          <Input id="lead-nextActionAt" name="nextActionAt" type="date" defaultValue={lead?.nextActionAt} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lead-notes">{t("leads.notes")}</Label>
          <Textarea id="lead-notes" name="notes" rows={3} maxLength={LEAD_LIMITS.notes} defaultValue={lead?.notes} dir="auto" />
        </div>
      </div>
      {errKey && <p className="text-sm font-medium text-destructive">{t(errKey)}</p>}
      {state.ok && !lead && <p className="text-sm text-emerald-700">{t("leads.saved")}</p>}
      <div className="flex items-center gap-2">
        <Submit label={lead ? t("leads.save") : t("leads.create")} />
        {lead && (
          <Button asChild variant="outline">
            <Link href={cancelHref}>{t("leads.cancel")}</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
