"use client";

// Catches errors thrown during rendering of the root layout itself — the one
// place a normal error.tsx boundary can't reach, since it replaces <html>.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#error-handling
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import NextError from "next/error";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
