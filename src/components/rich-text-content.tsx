import { cn } from "@/lib/utils";
import { looksLikeRichText, sanitizeRichText } from "@/lib/richtext";

/**
 * Read-only renderer for stored task descriptions / comments (server
 * component). Editor output is sanitized again here as defense in depth;
 * legacy plain-text rows keep the old whitespace-pre-wrap rendering.
 */
export function RichTextContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!looksLikeRichText(content)) {
    return <p className={cn("whitespace-pre-wrap text-sm", className)}>{content}</p>;
  }
  const html = sanitizeRichText(content);
  if (!html) return null;
  return (
    <div
      dir="auto"
      className={cn("rich-text text-sm", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
