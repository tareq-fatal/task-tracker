// Privacy-friendly analytics via self-hosted Umami (https://umami.is).
// No cookies, no PII — safe to fire without consent banners under GDPR.
//
// Configure via env:
//   NEXT_PUBLIC_UMAMI_SRC         e.g. https://analytics.coastshield.net/script.js
//   NEXT_PUBLIC_UMAMI_WEBSITE_ID  the website UUID from the Umami dashboard
// Leave either unset to disable analytics entirely (dev/local default).

declare global {
  interface Window {
    umami?: {
      track: (name: string, data?: Record<string, unknown>) => void;
    };
  }
}

export const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC || "";
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "";

export function isAnalyticsEnabled(): boolean {
  return Boolean(UMAMI_SRC && UMAMI_WEBSITE_ID);
}

/** Fire a custom event from client code (component/handler). No-ops if analytics is disabled. */
export function trackEvent(name: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.umami?.track(name, data);
}

/**
 * Fire a custom event from server code (server actions/route handlers) via
 * Umami's collect API. Best-effort and non-blocking — analytics must never
 * break the request it's attached to.
 */
export function trackServerEvent(name: string, data?: Record<string, unknown>) {
  if (!isAnalyticsEnabled()) return;
  const collectUrl = UMAMI_SRC.replace(/\/[^/]*\.js$/, "/api/send");

  fetch(collectUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "event",
      payload: {
        website: UMAMI_WEBSITE_ID,
        name,
        data,
        url: "/",
        hostname: "server",
      },
    }),
  }).catch(() => {
    // Analytics outage is not the caller's problem.
  });
}

// Custom event names — keep in sync with docs/analytics-umami.md.
export const ANALYTICS_EVENTS = {
  TASK_CREATED: "Task-Created",
  TASK_COMPLETED: "Task-Completed",
  SPRINT_CLOSED: "Sprint-Closed",
} as const;
