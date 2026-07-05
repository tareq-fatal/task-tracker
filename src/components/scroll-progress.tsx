"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A thin scroll-position indicator pinned to the very top of the viewport.
 *
 * Feedback from the APK: in long lists (tasks, comments, notifications) the user
 * had no sense of where they were. This fills a 0%→100% bar as the window
 * scrolls. It only appears once the page is genuinely long (> 2 viewports of
 * content) so short pages stay clean, and it is RTL-aware — the fill grows from
 * the right for Arabic. Tracks the window scroll, which is the app's single
 * scroll container (the shell header is sticky, content scrolls the document).
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false); // page long enough to bother
  const [rtl, setRtl] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const doc = document.documentElement;
    setRtl(doc.dir === "rtl" || getComputedStyle(doc).direction === "rtl");

    const measure = () => {
      raf.current = null;
      const scrollable = doc.scrollHeight - window.innerHeight;
      // Only engage past ~2 viewports of scrollable content.
      const longEnough = doc.scrollHeight > window.innerHeight * 2;
      setActive(longEnough);
      if (!longEnough || scrollable <= 0) {
        setProgress(0);
        return;
      }
      const p = Math.min(1, Math.max(0, window.scrollY / scrollable));
      setProgress(p);
    };

    const onScroll = () => {
      if (raf.current != null) return;
      raf.current = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Content can grow/shrink without a scroll or resize (route change, async
    // list load) — observe the body so the bar re-measures.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="h-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-transform duration-100 ease-out will-change-transform"
        style={{
          transform: `scaleX(${progress})`,
          transformOrigin: rtl ? "right" : "left",
        }}
      />
    </div>
  );
}
