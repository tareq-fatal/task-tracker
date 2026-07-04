"use client";

import { useState, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useT } from "@/components/i18n-provider";
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

  const opts: { m: Mode; icon: typeof Sun; key: string }[] = [
    { m: "light", icon: Sun, key: "theme.light" },
    { m: "dark", icon: Moon, key: "theme.dark" },
    { m: "system", icon: Monitor, key: "theme.system" },
  ];

  return (
    <div className="inline-flex rounded-lg border bg-muted p-1" role="group" aria-label={t("settings.theme")}>
      {opts.map((o) => (
        <button
          key={o.m}
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
      ))}
    </div>
  );
}
