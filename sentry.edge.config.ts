// Edge runtime Sentry init (edge API routes / edge-rendered pages), loaded by
// src/instrumentation.ts. Kept minimal — the edge runtime has no Node APIs.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  sendDefaultPii: false,

  beforeSend: scrubSensitiveData,
  beforeSendTransaction: scrubSensitiveData,

  debug: false,
});
