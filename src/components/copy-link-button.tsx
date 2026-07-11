"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n-provider";

export function CopyLinkButton() {
  const { toast } = useToast();
  const { t } = useT();
  return (
    <TooltipHelp textKey="tooltip.copy_link">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            toast(t("common.copied"));
          } catch {
            toast(t("common.copied"), "error");
          }
        }}
      >
        <Link2 className="me-1 h-4 w-4" />
        {t("common.copyLink")}
      </Button>
    </TooltipHelp>
  );
}
