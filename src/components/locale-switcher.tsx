"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Check } from "lucide-react";
import { setLocaleAction } from "@/actions/locale";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LOCALES, type Locale } from "@/lib/enums";

const LABELS: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
  de: "Deutsch",
};

export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TooltipHelp textKey="tooltip.language">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Language"
            disabled={pending}
          >
            <Globe className="h-4 w-4" />
          </Button>
        </TooltipHelp>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => choose(l)}
            className="justify-between"
          >
            <span>{LABELS[l]}</span>
            {l === current && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
