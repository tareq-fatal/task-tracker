"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { setProjectHiddenAction } from "@/actions/hidden-projects";

/**
 * TOF-0966 — Admin-only: Projekt verbergen bzw. wieder einblenden.
 * Nach dem Verbergen (ohne Anzeigemodus) gibt es die Seite für niemanden
 * mehr — deshalb zurück zur Projektliste statt einer 404.
 */
export function ProjectHideButton({
  projectId,
  hidden,
  revealActive,
}: {
  projectId: string;
  hidden: boolean;
  revealActive: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    const next = !hidden;
    if (next && !window.confirm(t("project.hide.confirm"))) return;
    start(async () => {
      const res = await setProjectHiddenAction(projectId, next).catch(() => ({ ok: false as const }));
      if (!res.ok) return;
      if (next && !revealActive) router.replace("/projects");
      else router.refresh();
    });
  }

  const Icon = pending ? Loader2 : hidden ? Eye : EyeOff;
  return (
    <Button variant="outline" onClick={toggle} disabled={pending} data-testid="project-hide-toggle">
      <Icon className={`me-1 h-4 w-4${pending ? " animate-spin" : ""}`} />
      {hidden ? t("project.unhide") : t("project.hide")}
    </Button>
  );
}
