import { cn } from "@/lib/utils";

/** Brand mark — rounded square + check in the brand colour. Optional wordmark. */
export function Logo({
  size = 32,
  withWordmark = false,
  wordmark = "Task Tracker",
  className,
  animated = false,
}: {
  size?: number;
  withWordmark?: boolean;
  wordmark?: string;
  className?: string;
  animated?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("shrink-0", animated && "tt-float")}
        aria-hidden
      >
        {/* TOF-0962: einfarbig in der Markenfarbe (Mandanten-Branding greift) */}
        <rect x="1" y="1" width="46" height="46" rx="13" style={{ fill: "hsl(var(--brand-from))" }} />
        <path
          d="M14 25.5L20.5 32L34 16"
          style={{ stroke: "hsl(var(--brand-foreground))" }}
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">{wordmark}</span>
      )}
    </span>
  );
}
