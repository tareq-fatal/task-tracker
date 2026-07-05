"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import type { SessionUser } from "@/lib/auth";

/** Tags the browser-side Sentry scope with the signed-in user so client
 *  errors carry the same tenantId/role context as server-side events set in
 *  the (app) layout. Deliberately omits email — see sentry-scrub.ts for why
 *  we keep PII out of events. */
export function SentryUserContext({
  user,
}: {
  user: Pick<SessionUser, "id" | "username" | "role" | "tenantId" | "tenantSlug">;
}) {
  useEffect(() => {
    Sentry.setUser({ id: user.id, username: user.username });
    Sentry.setTag("tenantId", user.tenantId);
    Sentry.setTag("tenantSlug", user.tenantSlug);
    Sentry.setTag("role", user.role);

    return () => Sentry.setUser(null);
  }, [user.id, user.username, user.tenantId, user.tenantSlug, user.role]);

  return null;
}
