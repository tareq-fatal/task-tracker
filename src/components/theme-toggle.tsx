"use client";

import { useState, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { TooltipHelp } from "@/components/ui/tooltip";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    setMode(((localStorage.getItem("theme") as Mode) ?? "system") || "system");
  }, []);

  // follow the OS when in "system" mode
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme:dark)");
    const h = () => apply("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [mode]);

  function set(m: Mode) {
    setMode(m);
    localStorage.setItem("theme", m);
    apply(m);
  }

  const opts: { m: Mode; icon: typeof Sun; key: string; tip: TKey }[] = [
    { m: "light", icon: Sun, key: "theme.light", tip: "tooltip.theme_light" },
    { m: "dark", icon: Moon, key: "theme.dark", tip: "tooltip.theme_dark" },
    { m: "system", icon: Monitor, key: "theme.system", tip: "tooltip.theme_system" },
  ];

  return (
    <div className="inline-flex rounded-lg border bg-muted p-1" role="group" aria-label={t("settings.theme")}>
      {opts.map((o) => (
        <TooltipHelp key={o.m} textKey={o.tip}>
          <button
            onClick={() => set(o.m)}
            aria-pressed={mode === o.m}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === o.m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <o.icon className="h-4 w-4" />
            {t(o.key as never)}
          </button>
        </TooltipHelp>
      ))}
    </div>
  );
}

/**
 * TOF-0962: kompakter Hell/Dunkel-Schalter für die Kopfzeile (ein Klick).
 * Wechselt zwischen hell und dunkel; „System“ bleibt in den Einstellungen.
 */
export function ThemeQuickToggle({ className }: { className?: string }) {
  const { t } = useT();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next: Mode = dark ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* Speicher gesperrt — Umschalten gilt dann nur für diese Seite */
    }
    apply(next);
    setDark(!dark);
  }
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("ui.theme.toggle" as TKey)}
      title={t("ui.theme.toggle" as TKey)}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground coarse:h-11 coarse:w-11",
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
