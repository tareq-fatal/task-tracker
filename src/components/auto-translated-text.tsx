"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Display wrapper for server-side TR↔x auto-translation (Kundenwunsch
 * 2026-08-02): shows the TRANSLATED text as the main content plus a discreet
 * "🌐 Translated from X · Show original" line; toggling reveals the original
 * below (same pattern as CommentTranslation). Server components render this
 * ONLY when a translation exists — original-language viewers get plain text.
 */
export function AutoTranslatedText({
  original,
  translated,
  sourceLang,
  textClassName,
  originalClassName,
}: {
  original: string;
  translated: string;
  sourceLang: string;
  /** Classes for the main (translated) text element. */
  textClassName?: string;
  /** Classes for the revealed original (defaults match comment styling). */
  originalClassName?: string;
}) {
  const { t } = useT();
  const [showOriginal, setShowOriginal] = useState(false);

  const key = `lang.${sourceLang}` as TKey;
  const label = t(key);
  const langName = label === key ? sourceLang : label;

  return (
    <div className="min-w-0">
      <p className={cn("whitespace-pre-wrap", textClassName)}>{translated}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-normal text-muted-foreground">
        <Languages className="h-3 w-3" />
        <span>{t("comments.translatedFrom", { lang: langName })}</span>
        <span>·</span>
        <button
          type="button"
          onClick={() => setShowOriginal((o) => !o)}
          className="hover:underline"
          data-testid="auto-toggle-original"
        >
          {t(showOriginal ? "comments.hideOriginal" : "comments.showOriginal")}
        </button>
      </div>
      {showOriginal && (
        <p
          className={cn(
            "mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm font-normal text-muted-foreground",
            originalClassName
          )}
        >
          {original}
        </p>
      )}
    </div>
  );
}
