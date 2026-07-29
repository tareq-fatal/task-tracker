"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";
import type { Locale } from "@/lib/enums";

type Translation = { text: string; sourceLanguage: string };

/**
 * X/Facebook-style comment auto-translation.
 *
 * Cached translation (server-fetched)  →  translated text is the MAIN text,
 * with a small grey "Translated from X · Show original" line; clicking shows
 * the original ADDITIONALLY below (not replacing), clicking again hides it.
 *
 * Not yet cached  →  original text plus a small "Translate" link; the click
 * fetches POST /api/comments/[id]/translate (spinner while pending) and then
 * switches into the state above. On error the original stays and a short
 * "translation unavailable" note appears.
 *
 * Rendered ONLY when the feature is on and comment.language !== UI locale —
 * the server decides that, so same-language comments carry zero extra UI.
 */
export function CommentTranslation({
  commentId,
  original,
  targetLang,
  initial,
}: {
  commentId: string;
  original: string;
  targetLang: Locale;
  initial: Translation | null;
}) {
  const { t } = useT();
  const [translation, setTranslation] = useState<Translation | null>(initial);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const langName = (code: string): string => {
    const key = `lang.${code}` as TKey;
    const label = t(key);
    return label === key ? code : label; // unknown code → show the raw code
  };

  const translate = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/comments/${commentId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: targetLang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Translation;
      setTranslation(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (!translation) {
    return (
      <div>
        <p className="whitespace-pre-wrap text-sm">{original}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Languages className="h-3 w-3" />
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <button onClick={translate} className="hover:underline" data-testid="translate-btn">
              {t("comments.translate")}
            </button>
          )}
          {failed && <span>· {t("comments.translateFailed")}</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="whitespace-pre-wrap text-sm">{translation.text}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Languages className="h-3 w-3" />
        <span>
          {t("comments.translatedFrom", { lang: langName(translation.sourceLanguage) })}
        </span>
        <span>·</span>
        <button
          onClick={() => setShowOriginal((o) => !o)}
          className="hover:underline"
          data-testid="toggle-original"
        >
          {t(showOriginal ? "comments.hideOriginal" : "comments.showOriginal")}
        </button>
      </div>
      {showOriginal && (
        <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
          {original}
          <span className="ms-1 text-xs">({langName(translation.sourceLanguage)})</span>
        </p>
      )}
    </div>
  );
}
