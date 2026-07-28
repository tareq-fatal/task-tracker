// Browser-side Sentry init. Next.js (and the Sentry webpack plugin) load this
// automatically as the client bundle's entry point — supersedes the older
// sentry.client.config.ts convention, which Turbopack doesn't support.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // No session replay / no default PII (IP, headers) — tenantId/role/id are
  // attached explicitly via Sentry.setUser() in SentryUserContext.
  sendDefaultPii: false,

  beforeSend: scrubSensitiveData,
  beforeSendTransaction: scrubSensitiveData,

  debug: false,
});

// Lets Sentry instrument App Router client-side navigations as spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
