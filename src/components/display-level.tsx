"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { setDisplayLevelAction } from "@/actions/project-visibility";
import { AFFILIATIONS, type Affiliation } from "@/lib/project-visibility/policy";

const KEY = { tarek: "aff.tarek", objektus: "aff.objektus", marine: "aff.marine" } as const;

/** Anzeigename einer Zugehörigkeit. */
export function useAffiliationLabel() {
  const { t } = useT();
  return (a: Affiliation) => t(KEY[a]);
}

/** TOF-0967 — Einstellungen (Admin): Anzeige-Ebene der Firma. Nichts gewählt = Alle. */
export function DisplayLevelSettings({ initial }: { initial: Affiliation[] }) {
  const { t } = useT();
  const label = useAffiliationLabel();
  const router = useRouter();
  const [chosen, setChosen] = useState<Affiliation[]>(initial);
  const [pending, start] = useTransition();
  const dirty = chosen.join() !== initial.join();

  function toggle(a: Affiliation, on: boolean) {
    setChosen((cur) => AFFILIATIONS.filter((x) => (x === a ? on : cur.includes(x))));
  }

  return (
    <div className="space-y-3" data-testid="display-level-settings">
      <p className="text-xs text-muted-foreground">{t("settings.displayLevel.hint")}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {AFFILIATIONS.map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(a)}
              disabled={pending}
              data-testid={`display-level-${a}`}
              onChange={(e) => toggle(a, e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
            {label(a)}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending || !dirty}
          data-testid="display-level-save"
          onClick={() =>
            start(async () => {
              const res = await setDisplayLevelAction(chosen).catch(() => ({ ok: false as const }));
              if (res.ok) router.refresh();
            })
          }
        >
          {t("settings.displayLevel.save")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {chosen.length === 0 || chosen.length === AFFILIATIONS.length
            ? t("settings.displayLevel.all")
            : chosen.map(label).join(" · ")}
        </span>
      </div>
    </div>
  );
}

/** Dezenter Hinweis oben (nur Admin), solange eine Anzeige-Ebene aktiv ist. */
export function DisplayLevelBanner({ level }: { level: Affiliation[] }) {
  const { t } = useT();
  const label = useAffiliationLabel();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="status"
      data-testid="display-level-banner"
      className="flex items-center justify-center gap-2 border-b bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
    >
      <Layers className="h-3.5 w-3.5" />
      <span>
        {t("level.banner")}: <span className="font-medium text-foreground">{level.map(label).join(" · ")}</span>
      </span>
      <button
        type="button"
        disabled={pending}
        data-testid="display-level-reset"
        className="ms-1 underline underline-offset-2 hover:text-foreground"
        onClick={() =>
          start(async () => {
            await setDisplayLevelAction([]).catch(() => {});
            router.refresh();
          })
        }
      >
        {t("level.reset")}
      </button>
    </div>
  );
}

/** Kleines Etikett „Objektus“/„Marine“/„Meine“ auf Projektkarten und -köpfen. */
export function AffiliationChip({ affiliation }: { affiliation: Affiliation }) {
  const label = useAffiliationLabel();
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label(affiliation)}
    </span>
  );
}
