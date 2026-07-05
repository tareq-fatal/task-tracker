"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n-provider";

type Platform = "desktop" | "android" | "ios" | "unknown";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detect(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ reports as Mac but has touch — treat coarse-pointer Macs as iOS
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

/**
 * #38 — the APK link only makes sense on desktop (download → sideload to a
 * phone). On Android we offer the PWA "install" instead; on iOS (can't run an
 * APK at all) we show the Add-to-Home-Screen hint.
 */
export function ApkDownloadLink() {
  const { t } = useT();
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detect());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Render nothing until we know the platform (avoids a desktop→mobile flash).
  if (platform === "unknown") return null;

  if (platform === "desktop") {
    return (
      <div className="mt-4 text-center">
        <a
          href="/download/task-tracker-latest.apk"
          className="text-xs font-medium text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
        >
          {t("login.downloadApp")}
        </a>
      </div>
    );
  }

  if (platform === "android") {
    return (
      <div className="mt-4 text-center">
        {installEvt ? (
          <button
            onClick={() => installEvt.prompt()}
            className="text-xs font-medium text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
          >
            {t("login.installAndroid")}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">{t("login.installAndroidHint")}</p>
        )}
      </div>
    );
  }

  // iOS — no APK possible; guide to the PWA add-to-home-screen flow.
  return (
    <div className="mt-4 text-center">
      <p className="text-xs text-muted-foreground">{t("login.installIos")}</p>
    </div>
  );
}
