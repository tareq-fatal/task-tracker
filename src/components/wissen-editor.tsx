"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { entscheidungAction, speichereWissenSeiteAction, type WissenStand } from "@/actions/wissen";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

const ARTEN = ["stand", "regeln", "adressen", "seite"] as const;
const feld = "w-full rounded-md border bg-background px-3 py-2 text-sm";

function Knopf({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "…" : label}</Button>;
}

/** TOF-0839: Seite anlegen/bearbeiten. Jede Speicherung = neue Version (unverändert = keine). */
export function WissenEditor({
  projectId,
  seite,
}: {
  projectId: string;
  seite?: { slug: string; titel: string; art: string; angepinnt: boolean; inhalt: string };
}) {
  const { t } = useT();
  const [stand, aktion] = useFormState<WissenStand, FormData>(speichereWissenSeiteAction, {});
  const neu = !seite;
  return (
    <form action={aktion} className="space-y-3" data-testid="wissen-editor">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="neu" value={neu ? "1" : "0"} />
      {!neu && <input type="hidden" name="slug" value={seite.slug} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("wissen.titel")}</span>
          <input name="titel" defaultValue={seite?.titel ?? ""} required maxLength={160} className={feld} dir="auto" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("wissen.art")}</span>
          <select name="art" defaultValue={seite?.art ?? "seite"} className={feld}>
            {ARTEN.map((a) => <option key={a} value={a}>{t(`wissen.art.${a}`)}</option>)}
          </select>
        </label>
      </div>
      {neu && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("wissen.slug")}</span>
          <input name="slug" placeholder="z. B. deploy" maxLength={60} className={`${feld} font-mono`} dir="ltr" />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="angepinnt" defaultChecked={seite?.angepinnt ?? false} />
        {t("wissen.pinnedHint")}
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("wissen.content")}</span>
        <textarea
          name="inhalt"
          defaultValue={seite?.inhalt ?? ""}
          rows={22}
          spellCheck={false}
          dir="auto"
          className="w-full rounded-md border bg-background p-3 font-mono text-sm leading-relaxed"
          data-testid="wissen-feld"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Knopf label={t("wissen.save")} />
        {stand.fehler && <span className="text-sm text-red-700" role="alert">{stand.fehler}</span>}
        {stand.ok && <span className="text-sm text-emerald-700">{stand.unveraendert ? t("wissen.unchanged") : t("wissen.saved")}</span>}
      </div>
    </form>
  );
}

/** Entscheidung eintragen (nur anhängen). */
export function EntscheidungForm({ projectId }: { projectId: string }) {
  const { t } = useT();
  const [stand, aktion] = useFormState<WissenStand, FormData>(entscheidungAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (stand.ok) ref.current?.reset();
  }, [stand]);
  return (
    <form ref={ref} action={aktion} className="space-y-2" data-testid="entscheidung-form">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
        <input type="date" name="datum" className={feld} aria-label={t("wissen.decision.date")} />
        <input name="wer" placeholder={t("wissen.decision.who")} maxLength={120} className={feld} dir="auto" />
      </div>
      <textarea name="was" required rows={2} placeholder={t("wissen.decision.what")} className={feld} dir="auto" />
      <textarea name="warum" required rows={2} placeholder={t("wissen.decision.why")} className={feld} dir="auto" />
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <input name="aufgaben" placeholder={`${t("wissen.decision.tasks")}: TOF-0839, …`} className={`${feld} font-mono`} dir="ltr" />
        <input name="korrigiertId" placeholder={`${t("wissen.decision.corrects")}: id`} className={`${feld} font-mono`} dir="ltr" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Knopf label={t("wissen.decision.add")} />
        {stand.fehler && <span className="text-sm text-red-700" role="alert">{stand.fehler}</span>}
        <span className="text-xs text-muted-foreground">{t("wissen.decision.appendOnly")}</span>
      </div>
    </form>
  );
}
