"use client";

import { useEffect } from "react";

/**
 * #12 — auto-marks comments as read when they scroll into view.
 *
 * The server renders every comment the current user still needs to read with a
 * `data-comment-read` attribute holding its id. This observer watches those
 * elements and POSTs `/api/comments/{id}/read` the first time each one is ~60%
 * visible, then stops watching it. Purely additive: if IntersectionObserver is
 * unavailable or a request fails, receipts simply stay unread.
 */
export function CommentReadObserver() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const seen = new Set<string>();
    const els = document.querySelectorAll<HTMLElement>("[data-comment-read]");
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const id = el.dataset.commentRead;
          observer.unobserve(el);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          fetch(`/api/comments/${id}/read`, {
            method: "POST",
            keepalive: true,
          }).catch(() => {});
        }
      },
      { threshold: 0.6 }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
