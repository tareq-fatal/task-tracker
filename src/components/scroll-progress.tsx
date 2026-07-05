"use client";

import { useEffect, useState } from "react";

/**
 * Thin top progress bar that fills 0→100% as the page scrolls — the polish you
 * see in top-tier Android apps. Tracks the document scroll (the app's main
 * content scrolls the window), is RTL-aware (fills from the leading edge), and
 * respects prefers-reduced-motion via `motion-reduce:transition-none`.
 */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);
  const [rtl, setRtl] = useState(false);

  useEffect(() => {
    setRtl(document.documentElement.dir === "rtl");
    let raf = 0;
    const compute = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setPct(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-transform duration-75 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${pct})`, transformOrigin: rtl ? "right" : "left" }}
      />
    </div>
  );
}
