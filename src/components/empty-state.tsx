import { cn } from "@/lib/utils";

/** Friendly empty state with a light on-brand illustration. */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/40 px-6 py-14 text-center",
        className
      )}
    >
      <Illustration className="mb-4 h-28 w-28" />
      <p className="text-base font-semibold">{title}</p>
      {hint && (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Illustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="26"
        y="18"
        width="68"
        height="86"
        rx="12"
        fill="hsl(199 89% 48% / 0.08)"
        stroke="hsl(199 89% 48% / 0.35)"
        strokeWidth="2"
      />
      <rect x="48" y="12" width="24" height="14" rx="5" fill="hsl(199 89% 48%)" />
      {/* check rows */}
      <circle cx="42" cy="46" r="5" fill="hsl(173 80% 40%)" />
      <path
        d="M39.5 46l1.8 1.8 3-3.4"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="54" y="43" width="28" height="6" rx="3" fill="hsl(214 32% 88%)" />
      <circle cx="42" cy="64" r="5" fill="hsl(199 89% 48%)" />
      <path
        d="M39.5 64l1.8 1.8 3-3.4"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="54" y="61" width="22" height="6" rx="3" fill="hsl(214 32% 88%)" />
      <circle
        cx="42"
        cy="82"
        r="5"
        fill="white"
        stroke="hsl(214 32% 80%)"
        strokeWidth="2"
      />
      <rect x="54" y="79" width="26" height="6" rx="3" fill="hsl(214 32% 92%)" />
      {/* sparkle */}
      <path
        d="M96 30c.8 3.2 1.6 4 4.8 4.8-3.2.8-4 1.6-4.8 4.8-.8-3.2-1.6-4-4.8-4.8 3.2-.8 4-1.6 4.8-4.8z"
        fill="hsl(173 80% 45%)"
      />
    </svg>
  );
}
