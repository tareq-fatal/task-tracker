import { describe, expect, it } from "vitest";
import {
  extractMentions,
  htmlToPlainText,
  isRichTextEmpty,
  looksLikeRichText,
  sanitizeRichText,
} from "./richtext";

describe("looksLikeRichText", () => {
  it("detects editor HTML vs legacy plain text", () => {
    expect(looksLikeRichText("<p>hi</p>")).toBe(true);
    expect(looksLikeRichText("  <p>hi</p>")).toBe(true);
    expect(looksLikeRichText("plain text")).toBe(false);
    expect(looksLikeRichText("a < b")).toBe(false);
  });
});

describe("sanitizeRichText", () => {
  it("keeps allowed formatting", () => {
    const html =
      '<h1>T</h1><p><strong>b</strong> <em>i</em> <u>u</u> <code>c</code></p><ul><li>x</li></ul><blockquote><p>q</p></blockquote>';
    expect(sanitizeRichText(html)).toContain("<strong>b</strong>");
    expect(sanitizeRichText(html)).toContain("<h1>T</h1>");
    expect(sanitizeRichText(html)).toContain("<blockquote>");
  });

  it("strips scripts and event handlers", () => {
    expect(sanitizeRichText('<p>x<script>alert(1)</script></p>')).toBe("<p>x</p>");
    expect(sanitizeRichText('<p onclick="alert(1)">x</p>')).toBe("<p>x</p>");
    expect(sanitizeRichText('<p><img src="x" onerror="alert(1)"></p>')).not.toContain("onerror");
  });

  it("drops javascript: URLs but keeps http and relative ones", () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">x</a></p>')).not.toContain(
      "javascript:"
    );
    expect(sanitizeRichText('<p><a href="/tasks/abc">x</a></p>')).toContain('href="/tasks/abc"');
    const ext = sanitizeRichText('<p><a href="https://example.com">x</a></p>');
    expect(ext).toContain('href="https://example.com"');
    expect(ext).toContain('rel="noopener noreferrer nofollow"');
    expect(ext).toContain('target="_blank"');
  });

  it("keeps mention spans and task-ref links with their data attributes", () => {
    const html =
      '<p><span data-type="mention" class="mention" data-id="alice" data-label="Alice">@Alice</span> see <a data-type="taskRef" class="task-ref" data-id="t1" href="/tasks/t1">#Fix</a></p>';
    const out = sanitizeRichText(html);
    expect(out).toContain('data-id="alice"');
    expect(out).toContain('href="/tasks/t1"');
    expect(out).toContain('class="mention"');
  });

  it("returns empty string for visually empty documents", () => {
    expect(sanitizeRichText("<p></p>")).toBe("");
    expect(sanitizeRichText("<p><br></p>")).toBe("");
  });

  it("passes legacy plain text through untouched", () => {
    expect(sanitizeRichText("hello & <goodbye")).toBe("hello & <goodbye");
  });
});

describe("isRichTextEmpty", () => {
  it("treats empty paragraphs as empty, images as content", () => {
    expect(isRichTextEmpty("<p></p>")).toBe(true);
    expect(isRichTextEmpty("")).toBe(true);
    expect(isRichTextEmpty('<p><img src="/uploads/x.png"></p>')).toBe(false);
    expect(isRichTextEmpty("<p>x</p>")).toBe(false);
  });
});

describe("htmlToPlainText", () => {
  it("flattens blocks to newlines and decodes entities", () => {
    expect(htmlToPlainText("<p>a</p><p>b &amp; c</p>")).toBe("a\nb & c");
    expect(htmlToPlainText("<ul><li>one</li><li>two</li></ul>")).toBe("• one\n• two");
  });
  it("passes plain text through", () => {
    expect(htmlToPlainText("just text")).toBe("just text");
  });
});

describe("extractMentions", () => {
  it("finds mention nodes by data-id", () => {
    const html =
      '<p><span data-type="mention" data-id="Alice.B" data-label="Alice B">@Alice B</span> hi</p>';
    expect(extractMentions(html)).toContain("alice.b");
  });
  it("still finds plain-typed @username", () => {
    expect(extractMentions("<p>ping @bob please</p>")).toContain("bob");
    expect(extractMentions("ping @bob please")).toContain("bob");
  });
  it("dedupes across both sources", () => {
    const html = '<p><span data-type="mention" data-id="bob">@bob</span> and @bob</p>';
    expect(extractMentions(html)).toEqual(["bob"]);
  });
});
