"use client";

import { useEffect, useState } from "react";
import Joyride, {
  STATUS,
  type Step,
  type CallBackProps,
} from "react-joyride";
import { useT } from "@/components/i18n-provider";
import { completeTourAction } from "@/actions/tour";
import type { TKey } from "@/lib/i18n";

export function WelcomeTour({
  run: initialRun,
  role,
}: {
  run: boolean;
  role: string;
}) {
  const { t } = useT();
  const [mounted, setMounted] = useState(false);
  const [run, setRun] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted || !initialRun) return;
    // Give the layout a moment so target elements exist
    const id = setTimeout(() => setRun(true), 700);
    return () => clearTimeout(id);
  }, [mounted, initialRun]);

  if (!mounted) return null;

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 768;

  const center = (key: TKey): Step => ({
    target: "body",
    placement: "center",
    content: t(key),
    disableBeacon: true,
  });
  // On mobile the sidebar is hidden → fall back to centered cards.
  const at = (sel: string, key: TKey): Step =>
    isMobile
      ? center(key)
      : { target: sel, content: t(key), disableBeacon: true };

  const adminSteps: Step[] = [
    // Centered welcome step — independent of the page-transition animation so it
    // never gets skipped while [data-tour="dashboard"] is mid-fade.
    center("tour.admin.1"),
    at('[data-tour="sidebar"]', "tour.admin.2"),
    at('[data-tour="nav-board"]', "tour.admin.3"),
    at('[data-tour="new-task"]', "tour.admin.4"),
    at('[data-tour="nav-teams"]', "tour.admin.5"),
    at('[data-tour="nav-users"]', "tour.admin.6"),
    center("tour.admin.7"),
    at('[data-tour="topbar-actions"]', "tour.admin.8"),
  ];
  const userSteps: Step[] = [
    center("tour.user.1"),
    at('[data-tour="nav-board"]', "tour.user.2"),
    center("tour.user.3"),
    center("tour.user.4"),
    at('[data-tour="topbar-actions"]', "tour.user.5"),
  ];

  const steps =
    role === "Admin" || role === "SuperAdmin" ? adminSteps : userSteps;

  function handle(data: CallBackProps) {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      completeTourAction();
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableScrolling={false}
      scrollToFirstStep
      callback={handle}
      locale={{
        back: t("tour.back"),
        next: t("tour.next"),
        nextLabelWithProgress: t("tour.nextProgress"),
        skip: t("tour.skip"),
        last: t("tour.last"),
      }}
      styles={{
        options: {
          primaryColor: "#4f46e5",
          textColor: "#1f2937",
          backgroundColor: "#ffffff",
          arrowColor: "#ffffff",
          overlayColor: "rgba(15, 23, 42, 0.55)",
          zIndex: 10000,
        },
        tooltip: { borderRadius: 16, padding: 20 },
        tooltipContainer: { textAlign: "start" as const },
        tooltipContent: { padding: "8px 0" },
        buttonNext: {
          borderRadius: 10,
          padding: "8px 14px",
          backgroundColor: "#4f46e5",
        },
        buttonBack: { color: "#6b7280" },
        buttonSkip: { color: "#94a3b8" },
      }}
    />
  );
}
