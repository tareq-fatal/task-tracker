"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";
import { WelcomeTour } from "@/components/welcome-tour";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n-provider";
import { completeOnboardingAction } from "@/actions/onboarding";

type Phase = "modal" | "tour" | "done";

/**
 * First-time onboarding orchestrator. Drives the sequence:
 *   welcome modal (role explanation + optional sample project) → guided tour → done.
 *
 * `needsOnboarding` gates the welcome modal (first ever login). `needsTour`
 * gates the standalone tour replay (Settings → "restart tour", which only
 * resets hasSeenTour). Completion is persisted server-side.
 */
export function OnboardingFlow({
  name,
  role,
  needsOnboarding,
  needsTour,
}: {
  name: string;
  role: string;
  needsOnboarding: boolean;
  needsTour: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useT();

  const [phase, setPhase] = useState<Phase>(
    needsOnboarding ? "modal" : needsTour ? "tour" : "done"
  );

  function finishOnboarding() {
    setPhase("done");
    // Persist in the background; UI has already advanced.
    void completeOnboardingAction();
  }

  return (
    <>
      <WelcomeModal
        open={phase === "modal"}
        name={name}
        role={role}
        onStartTour={() => setPhase("tour")}
        onSkip={finishOnboarding}
        onSampleCreated={(projectId) => {
          toast(t("onboarding.sample.created"));
          // Refresh so the new project/board data is visible behind the tour.
          router.refresh();
          setPhase("tour");
          if (projectId) router.push(`/projects/${projectId}`);
        }}
      />
      <WelcomeTour
        run={phase === "tour"}
        role={role}
        onFinish={finishOnboarding}
      />
    </>
  );
}
