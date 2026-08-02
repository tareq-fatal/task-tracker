"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mobile-simplify 2026-08: Kanban is a desktop feature — on phones the board
 * route bounces to the list (CSS media query decides, not user agent). Mounted
 * on /board only; resizing a desktop window below md mid-session also bounces,
 * which matches the "not reachable on mobile" requirement.
 */
export function MobileBoardRedirect() {
  const router = useRouter();
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const check = () => {
      if (mq.matches) router.replace("/list");
    };
    check();
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, [router]);
  return null;
}
