"use client";

import { useT } from "@/components/i18n-provider";
import { errorKey } from "@/lib/i18n";

/**
 * Renders a server error code in the viewer's language. Known codes
 * (FORBIDDEN, NO_FILE, …) come from the dictionary; unknown strings are
 * shown verbatim so nothing is ever swallowed.
 */
export function ErrorText({
  code,
  className = "text-sm font-medium text-destructive",
}: {
  code?: string | null;
  className?: string;
}) {
  const { t } = useT();
  if (!code) return null;
  const key = errorKey(code);
  return <p className={className}>{key ? t(key) : code}</p>;
}

/** Hook variant for places that need the plain string (toasts, confirm()). */
export function useErrorText() {
  const { t } = useT();
  return (code?: string | null) => {
    if (!code) return "";
    const key = errorKey(code);
    return key ? t(key) : code;
  };
}
