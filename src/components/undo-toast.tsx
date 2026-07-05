"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { useT } from "@/components/i18n-provider";

/**
 * A transient toast with an Undo affordance and a visible countdown. Auto-
 * dismisses after `duration` ms (default 10s). Pure presentation — the parent
 * owns the undo token and does the actual reversal in `onUndo`.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
  duration = 10_000,
  pending = false,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
  pending?: boolean;
}) {
  const { t } = useT();
  const [remaining, setRemaining] = useState(duration);
  // Keep the latest onDismiss without restarting the countdown on every render.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => {
      const left = duration - (Date.now() - started);
      if (left <= 0) {
        clearInterval(tick);
        setRemaining(0);
        dismissRef.current();
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => clearInterval(tick);
    // Runs once per toast instance; duration is stable for a given toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secs = Math.ceil(remaining / 1000);
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));

  return (
    <div
      role="status"
      className="tt-rise pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-xl border bg-card px-4 py-2.5 text-sm shadow-lg"
    >
      <span className="font-medium">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t("bulk.undo")}
        <span className="tabular-nums opacity-80">{secs}s</span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("common.cancel")}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      {/* countdown bar */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-500 transition-[width] duration-100 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
