"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Poor-man's realtime: re-fetch the server component on an interval while
 *  the tab is visible. (No WebSocket layer in this stack — deliberate.) */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
