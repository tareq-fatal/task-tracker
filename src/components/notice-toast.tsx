"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

// Customer principle (2026-07-29): non-admins never see blocking error pages —
// content that is gone/forbidden simply "isn't there". Server pages redirect
// with ?notice=<slug>; this component turns the slug into one short toast and
// strips the parameter so a reload/back doesn't repeat it.
//
// Deliberately reads window.location instead of useSearchParams: this lives in
// the persistent app LAYOUT, where useSearchParams (Suspense + internal
// useMemo) crashed with React #310 on prod. usePathname is the re-run trigger
// (it changes when a redirect lands here); the effect self-disarms by removing
// the parameter, so extra runs are no-ops.
const NOTICES: Record<string, TKey> = {
  "task-unavailable": "noAccess.unavailableTask",
  "project-unavailable": "noAccess.unavailableProject",
};

export function NoticeToast() {
  const pathname = usePathname();
  const { toast } = useToast();
  const { t } = useT();

  useEffect(() => {
    const url = new URL(window.location.href);
    const slug = url.searchParams.get("notice");
    if (!slug || !NOTICES[slug]) return;
    toast(t(NOTICES[slug]), "error");
    url.searchParams.delete("notice");
    const rest = url.searchParams.toString();
    window.history.replaceState(null, "", url.pathname + (rest ? `?${rest}` : "") + url.hash);
    // `toast`/`t` are intentionally NOT deps: firing the toast re-renders the
    // providers, which would re-create them and loop the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
