"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

// Customer principle (2026-07-29): non-admins never see blocking error pages —
// content that is gone/forbidden simply "isn't there". Server pages redirect
// with ?notice=<slug>; this component turns the slug into one short toast and
// strips the parameter so a reload/back doesn't repeat it.
const NOTICES: Record<string, TKey> = {
  "task-unavailable": "noAccess.unavailableTask",
  "project-unavailable": "noAccess.unavailableProject",
};

export function NoticeToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useT();
  const shown = useRef(false);

  const slug = params.get("notice");

  useEffect(() => {
    if (!slug || !NOTICES[slug] || shown.current) return;
    shown.current = true;
    toast(t(NOTICES[slug]), "error");
    const rest = new URLSearchParams(params.toString());
    rest.delete("notice");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [slug, params, pathname, router, toast, t]);

  return null;
}
