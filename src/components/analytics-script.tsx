import Script from "next/script";
import { UMAMI_SRC, UMAMI_WEBSITE_ID, isAnalyticsEnabled } from "@/lib/analytics";

// Self-hosted Umami tracker. No cookies are set and no personal data is
// collected, so this can load unconditionally — no cookie-consent gate needed.
export function AnalyticsScript() {
  if (!isAnalyticsEnabled()) return null;

  return (
    <Script
      src={UMAMI_SRC}
      data-website-id={UMAMI_WEBSITE_ID}
      strategy="afterInteractive"
    />
  );
}
