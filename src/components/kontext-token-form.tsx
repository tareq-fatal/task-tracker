"use client";

import { useFormState, useFormStatus } from "react-dom";
import { erzeugeKontextTokenAction, type TokenErzeugenStand } from "@/actions/kontext";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

function Knopf({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "…" : label}</Button>;
}

/** Token erzeugen; der Klartext steht genau einmal hier und wird nirgends gespeichert. */
export function KontextTokenForm() {
  const { t } = useT();
  const [stand, aktion] = useFormState<TokenErzeugenStand, FormData>(erzeugeKontextTokenAction, {});
  return (
    <div className="space-y-3">
      <form action={aktion} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          {t("kontext.tokenName")}
          <input name="name" required maxLength={80} className="h-9 rounded-md border bg-background px-2" />
        </label>
        <label className="flex flex-col gap-1">
          {t("kontext.tokenArt")}
          <select name="art" defaultValue="kontext" className="h-9 rounded-md border bg-background px-2">
            <option value="kontext">{t("kontext.artKontext")}</option>
            <option value="kommentar">{t("kontext.artKommentar")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("kontext.tokenTage")}
          <input name="tage" type="number" min={0} defaultValue={365} className="h-9 w-28 rounded-md border bg-background px-2" />
        </label>
        <Knopf label={t("kontext.tokenCreate")} />
      </form>
      {stand.fehler && <p className="text-sm text-red-700">{stand.fehler}</p>}
      {stand.raw && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950" data-testid="token-einmal">
          <p className="mb-2 font-semibold">{t("kontext.tokenOnce")}</p>
          <code className="block select-all break-all rounded bg-background p-2 font-mono">{stand.raw}</code>
        </div>
      )}
    </div>
  );
}
