"use client";

// Zero-dependency hover-help tooltip.
//
// We intentionally do NOT pull in @radix-ui/react-tooltip: it isn't installed,
// and a self-contained primitive lets us fully control the delay, viewport
// flipping, keyboard/focus behaviour, mobile long-press and the per-user
// on/off preference (stored in localStorage, so no DB migration on the shared
// dev database — see the branch report). The public surface mirrors the shadcn
// ergonomics: <Tooltip content=…><Trigger/></Tooltip> plus the i18n-aware
// <TooltipHelp textKey=… /> convenience wrapper.

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

export type TooltipSide = "top" | "bottom" | "left" | "right";

/* ------------------------------------------------------------------ */
/* Per-user preference (localStorage, default ON)                      */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "tt.tooltips";
const CHANGE_EVENT = "tt:tooltips-changed";

/** Read the current preference. Tooltips are on unless explicitly disabled. */
export function tooltipsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "0";
}

/** Persist the preference and notify any live <Tooltip> instances. */
export function setTooltipsEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Subscribe to the preference. SSR-safe (starts enabled, syncs on mount). */
export function useTooltipsEnabled(): boolean {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    const sync = () => setOn(tooltipsEnabled());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return on;
}

/* ------------------------------------------------------------------ */
/* Positioning                                                         */
/* ------------------------------------------------------------------ */

const GAP = 8; // px between trigger and bubble

export type TooltipRect = { top: number; bottom: number; left: number; right: number; width: number; height: number };
export type TooltipSize = { w: number; h: number };
export type TooltipPlaced = { top: number; left: number; side: TooltipSide };

/**
 * Pure placement math: given the trigger rect, bubble size, preferred side and
 * viewport, return the on-screen top/left and the side actually used (after
 * flipping away from an edge). Exported for unit testing.
 */
export function computeTooltipPosition(
  rect: TooltipRect,
  size: TooltipSize,
  pref: TooltipSide,
  vw: number,
  vh: number
): TooltipPlaced {
  let side = pref;
  // Flip to the opposite side when the preferred one would clip the viewport.
  if (side === "top" && rect.top < size.h + GAP) side = "bottom";
  else if (side === "bottom" && vh - rect.bottom < size.h + GAP) side = "top";
  else if (side === "left" && rect.left < size.w + GAP) side = "right";
  else if (side === "right" && vw - rect.right < size.w + GAP) side = "left";

  let top: number;
  let left: number;
  if (side === "top") {
    top = rect.top - size.h - GAP;
    left = rect.left + rect.width / 2 - size.w / 2;
  } else if (side === "bottom") {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - size.w / 2;
  } else if (side === "left") {
    left = rect.left - size.w - GAP;
    top = rect.top + rect.height / 2 - size.h / 2;
  } else {
    left = rect.right + GAP;
    top = rect.top + rect.height / 2 - size.h / 2;
  }

  // Keep the bubble fully on-screen.
  left = Math.max(GAP, Math.min(left, vw - size.w - GAP));
  top = Math.max(GAP, Math.min(top, vh - size.h - GAP));
  return { top, left, side };
}

/* ------------------------------------------------------------------ */
/* Ref helpers                                                         */
/* ------------------------------------------------------------------ */

function setRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value);
  else if (ref && typeof ref === "object") (ref as React.MutableRefObject<T | null>).current = value;
}

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (value: T) => refs.forEach((r) => setRef(r, value));
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

export type TooltipProps = {
  /** Bubble contents. When empty/falsy the tooltip is inert. */
  content: React.ReactNode;
  /** Preferred side; auto-flips when it would clip. Default "top". */
  side?: TooltipSide;
  /** Hover delay in ms before showing. Default 500. */
  delayMs?: number;
  /** Force-disable this one tooltip (e.g. while a menu is open). */
  disabled?: boolean;
  /** A single focusable/hoverable element (button, link, icon-button…). */
  children: React.ReactElement;
  // Any other props (e.g. those injected by a Radix `asChild` trigger) arrive
  // via `...rest` at runtime and are forwarded onto the child, keeping the
  // tooltip transparent inside `<SomeTrigger asChild><Tooltip/></SomeTrigger>`.
};

const LONG_PRESS_MS = 500;

/** Compose several optional event handlers into one. */
function compose(...fns: Array<((e: unknown) => void) | undefined>) {
  return (e: unknown) => fns.forEach((fn) => fn?.(e));
}

export const Tooltip = React.forwardRef<HTMLElement, TooltipProps>(function Tooltip(
  { content, side = "top", delayMs = 500, disabled = false, children, ...rest },
  forwardedRef
) {
  const enabled = useTooltipsEnabled();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [coords, setCoords] = React.useState<TooltipPlaced>({ top: -9999, left: -9999, side });

  const triggerRef = React.useRef<HTMLElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const showTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const pressTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const reactId = React.useId();
  const tipId = `tt-${reactId}`;

  React.useEffect(() => setMounted(true), []);

  const clearTimers = React.useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  const scheduleOpen = React.useCallback(
    (delay: number) => {
      clearTimers();
      showTimer.current = setTimeout(() => setOpen(true), delay);
    },
    [clearTimers]
  );

  const close = React.useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  // Re-measure & position whenever the bubble is open.
  React.useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = triggerRef.current;
      const tip = tipRef.current;
      if (!el || !tip) return;
      const r = el.getBoundingClientRect();
      setCoords(
        computeTooltipPosition(r, { w: tip.offsetWidth, h: tip.offsetHeight }, side, window.innerWidth, window.innerHeight)
      );
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, side, content]);

  // Dismiss on Escape (keyboard users).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Clean up timers on unmount.
  React.useEffect(() => clearTimers, [clearTimers]);

  const child = children as React.ReactElement<Record<string, unknown>> & { ref?: React.Ref<HTMLElement> };
  const p = child.props;
  // Props injected by a parent (e.g. Radix `asChild`) arrive via `...rest`.
  const injected = rest as Record<string, unknown>;
  const h = (name: string) => injected[name] as ((e: unknown) => void) | undefined;
  const own = (name: string) => p[name] as ((e: unknown) => void) | undefined;
  const mergedRef = mergeRefs(triggerRef, child.ref, forwardedRef as React.Ref<HTMLElement>);

  const active = enabled && !disabled && content != null && content !== "";

  // Even when inactive we must stay transparent: forward injected props + ref
  // onto the child so a wrapping trigger keeps working.
  if (!active) {
    return React.cloneElement(child, { ...injected, ref: mergedRef } as Record<string, unknown>);
  }

  const trigger = React.cloneElement(child, {
    ...injected,
    ref: mergedRef,
    "aria-describedby": open ? tipId : p["aria-describedby"],
    onMouseEnter: compose(own("onMouseEnter"), h("onMouseEnter"), () => scheduleOpen(delayMs)),
    onMouseLeave: compose(own("onMouseLeave"), h("onMouseLeave"), () => close()),
    onFocus: compose(own("onFocus"), h("onFocus"), () => scheduleOpen(Math.min(delayMs, 120))),
    onBlur: compose(own("onBlur"), h("onBlur"), () => close()),
    onTouchStart: compose(own("onTouchStart"), h("onTouchStart"), () => {
      clearTimers();
      pressTimer.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
    }),
    onTouchEnd: compose(own("onTouchEnd"), h("onTouchEnd"), () => clearTimers()),
    onTouchMove: compose(own("onTouchMove"), h("onTouchMove"), () => clearTimers()),
    // A click/activation means the user acted — get out of the way.
    onClick: compose(own("onClick"), h("onClick"), () => close()),
  } as Record<string, unknown>);

  return (
    <>
      {trigger}
      {open &&
        mounted &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            id={tipId}
            className={cn(
              "pointer-events-none fixed z-[100] max-w-[16rem] rounded-md bg-foreground px-2.5 py-1.5",
              "text-xs font-medium leading-snug text-background shadow-md",
              "animate-in fade-in-0 zoom-in-95"
            )}
            style={{ top: coords.top, left: coords.left }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
});

/* ------------------------------------------------------------------ */
/* TooltipHelp — i18n convenience wrapper                              */
/* ------------------------------------------------------------------ */

export type TooltipHelpProps = {
  /** i18n key (usually a `tooltip.*` key). */
  textKey: TKey;
  side?: TooltipSide;
  delayMs?: number;
  disabled?: boolean;
  children: React.ReactElement;
};

/**
 * Wrap any button/icon to give it hover help:
 *   <TooltipHelp textKey="tooltip.new_task"><Button>…</Button></TooltipHelp>
 */
export const TooltipHelp = React.forwardRef<HTMLElement, TooltipHelpProps>(function TooltipHelp(
  { textKey, side, delayMs, disabled, children, ...rest },
  ref
) {
  const { t } = useT();
  return (
    <Tooltip content={t(textKey)} side={side} delayMs={delayMs} disabled={disabled} ref={ref} {...rest}>
      {children}
    </Tooltip>
  );
});
