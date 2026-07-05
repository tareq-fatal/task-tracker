import sanitizeHtml from "sanitize-html";
import { parseMentions } from "./notifications-core";

/**
 * Rich text (task descriptions + comments) is stored as sanitized HTML
 * produced by the Tiptap editor. Legacy content is plain text — anything that
 * doesn't start with "<" is rendered through the old whitespace-pre-wrap path.
 *
 * Sanitization runs server-side on WRITE (actions) and again on READ
 * (RichTextContent) as defense in depth, so a stray row written by an import
 * or an old client can never inject markup.
 */

/** Does this stored value look like editor HTML (vs. legacy plain text)? */
export function looksLikeRichText(content: string): boolean {
  return /^\s*</.test(content);
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
    "code", "pre", "a", "ul", "ol", "li", "blockquote",
    "h1", "h2", "h3", "img", "span",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target", "class", "data-type", "data-id", "data-label"],
    img: ["src", "alt"],
    span: ["class", "data-type", "data-id", "data-label"],
    code: ["class"],
  },
  allowedClasses: {
    a: ["task-ref"],
    span: ["mention"],
    code: [/^language-/],
  },
  // Relative URLs (/uploads/…, /tasks/…) stay allowed; absolute ones must be
  // http(s)/mailto — javascript:/data: are dropped.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  transformTags: {
    // External links always open in a new tab and never leak the referrer.
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      if (/^https?:\/\//i.test(href)) {
        return {
          tagName,
          attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
        };
      }
      // Internal links don't need (and shouldn't keep) target/rel.
      const { target: _t, rel: _r, ...rest } = attribs;
      return { tagName, attribs: rest };
    },
  },
};

/** Sanitize editor HTML for storage/rendering. Returns "" when visually empty. */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  if (!looksLikeRichText(html)) return html; // legacy plain text passes through
  const clean = sanitizeHtml(html, SANITIZE_OPTIONS).trim();
  return isRichTextEmpty(clean) ? "" : clean;
}

/** True when the HTML has no visible content (empty paragraphs only). */
export function isRichTextEmpty(html: string): boolean {
  if (!html) return true;
  if (/<img\s/i.test(html)) return false; // an image alone is content
  return htmlToPlainText(html).trim().length === 0;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Flatten stored content (HTML or legacy plain text) to plain text — used for
 * notification bodies, the activity log and mention parsing. Block boundaries
 * become newlines so previews stay readable.
 */
export function htmlToPlainText(content: string): string {
  if (!content) return "";
  if (!looksLikeRichText(content)) return content;
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h1|h2|h3|blockquote|pre|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Usernames mentioned in a comment: explicit editor mention nodes
 * (data-type="mention" data-id="<username>") plus plain-typed @username
 * (legacy behavior), lowercased and deduplicated.
 */
export function extractMentions(content: string): string[] {
  const out = new Set<string>();
  const tagRe = /<(?:span|a)\b[^>]*data-type="mention"[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(content)) !== null) {
    const id = /data-id="([^"]+)"/i.exec(tag[0]);
    if (id) out.add(id[1].toLowerCase());
  }
  // Plain-typed @username (legacy behavior) — but strip mention ELEMENTS
  // first, so display labels ("@Alice B") don't produce bogus usernames.
  const withoutMentionNodes = content.replace(
    /<(span|a)\b[^>]*data-type="mention"[^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );
  for (const name of parseMentions(htmlToPlainText(withoutMentionNodes))) out.add(name);
  return [...out];
}
