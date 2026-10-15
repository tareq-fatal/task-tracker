"use client";

import { useFormState, useFormStatus } from "react-dom";
import { speichereKontextAction, type KontextSpeichernStand } from "@/actions/kontext";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

function Knopf({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "…" : label}</Button>;
}

/** Markdown-Feld „Kontext für Claude“; jede Speicherung wird eine neue Fassung. */
export function KontextEditor({ projectId, inhalt }: { projectId: string; inhalt: string }) {
  const { t } = useT();
  const [stand, aktion] = useFormState<KontextSpeichernStand, FormData>(speichereKontextAction, {});
  return (
    <form action={aktion} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <textarea
        name="content"
        defaultValue={inhalt}
        rows={24}
        spellCheck={false}
        dir="auto"
        className="w-full rounded-md border bg-background p-3 font-mono text-sm leading-relaxed"
        aria-label={t("kontext.title")}
        data-testid="kontext-feld"
      />
      <div className="flex items-center gap-3">
        <Knopf label={t("kontext.save")} />
        {stand.fehler && <span className="text-sm text-red-700">{stand.fehler}</span>}
        {stand.ok && <span className="text-sm text-emerald-700">{stand.unveraendert ? t("kontext.unchanged") : t("kontext.saved")}</span>}
      </div>
    </form>
  );
}
