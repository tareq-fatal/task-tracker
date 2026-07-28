// Server-side Sentry init (Node.js runtime), loaded by src/instrumentation.ts.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // We attach tenantId/role ourselves via Sentry.setUser() — don't let the SDK
  // also capture raw IPs/cookies from the request.
  sendDefaultPii: false,

  beforeSend: scrubSensitiveData,
  beforeSendTransaction: scrubSensitiveData,

  debug: false,
});
