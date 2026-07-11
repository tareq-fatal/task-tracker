"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { restartTourAction } from "@/actions/tour";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import { useT } from "@/components/i18n-provider";

export function RestartTourButton() {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <TooltipHelp textKey="tooltip.restart_tour">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await restartTourAction();
            router.push("/");
            router.refresh();
          })
        }
      >
        <Compass className="me-1 h-4 w-4" />
        {t("tour.restart")}
      </Button>
    </TooltipHelp>
  );
}
