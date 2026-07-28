"use client";

import { useState, useTransition } from "react";
import {
  Compass,
  Rocket,
  KanbanSquare,
  Timer,
  Users,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { isAdminRole } from "@/lib/enums";
import { createSampleProjectAction } from "@/actions/onboarding";
import type { TKey } from "@/lib/i18n";

export function WelcomeModal({
  open,
  name,
  role,
  onStartTour,
  onSkip,
  onSampleCreated,
}: {
  open: boolean;
  name: string;
  role: string;
  /** Called to begin the guided tour (no sample project). */
  onStartTour: () => void;
  /** Called when the user skips onboarding entirely. */
  onSkip: () => void;
  /** Called after a sample project is created — receives its id. */
  onSampleCreated: (projectId?: string) => void;
}) {
  const { t } = useT();
  const admin = isAdminRole(role);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  // Feature highlights shown as a short "what you can do here" list.
  // Deliberately NO role/permission explanation and no marketing copy —
  // the customer wants a neutral, purely functional onboarding.
  const features: { icon: typeof KanbanSquare; key: TKey }[] = [
    { icon: KanbanSquare, key: "onboarding.feature.board" },
    { icon: Timer, key: "onboarding.feature.timer" },
    { icon: Users, key: "onboarding.feature.collab" },
  ];

  function handleCreateSample() {
    setError(false);
    startTransition(async () => {
      const res = await createSampleProjectAction();
      if (res.ok) onSampleCreated(res.projectId);
      else setError(true);
    });
  }

  return (
    <Dialog
      open={open}
      // The dialog's built-in X maps to "skip" so we always persist the
      // onboarded flag. Advancing via Start-tour / Create-sample flips `open`
      // through the parent instead, which doesn't fire onOpenChange.
      onOpenChange={(next) => {
        if (!next) onSkip();
      }}
    >
      <DialogContent
        className="max-w-xl"
        // Prevent accidental dismissal by Escape / outside-click; only the
        // explicit X or Skip button ends onboarding.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg shadow-indigo-500/30 sm:mx-0">
            <Rocket className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl">
            {t("onboarding.welcome.title", { name })}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {t("onboarding.welcome.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {/* What you can do */}
        <ul className="grid gap-2">
          {features.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-indigo-600 dark:text-indigo-300">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-muted-foreground">{t(key)}</span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-sm text-destructive">{t("onboarding.sample.error")}</p>
        )}

        {/* Actions */}
        <div className="mt-1 flex flex-col gap-2">
          {admin && (
            <Button
              type="button"
              variant="brand"
              className="w-full"
              disabled={pending}
              onClick={handleCreateSample}
            >
              {pending ? (
                <Loader2 className="me-1 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="me-1 h-4 w-4" />
              )}
              {t("onboarding.cta.sample")}
            </Button>
          )}
          <Button
            type="button"
            variant={admin ? "outline" : "brand"}
            className="w-full"
            disabled={pending}
            onClick={onStartTour}
          >
            <Compass className="me-1 h-4 w-4" />
            {t("onboarding.cta.tour")}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={onSkip}
            className="mx-auto mt-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
          >
            {t("onboarding.cta.skip")}
          </button>
        </div>

        {admin && (
          <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            {t("onboarding.sample.hint")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
