import { cn } from "@/lib/utils";

/** Brand mark — gradient rounded square + check. Optional wordmark. */
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
        className={cn("shrink-0 drop-shadow-sm", animated && "tt-float")}
        aria-hidden
      >
        <defs>
          <linearGradient id="tt-mark" x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366F1" />
            <stop offset="0.5" stopColor="#A855F7" />
            <stop offset="1" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#tt-mark)" />
        <rect x="11" y="11" width="26" height="26" rx="7" fill="#fff" fillOpacity="0.14" />
        <path
          d="M14 25.5L20.5 32L34 16"
          stroke="#fff"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="text-lg font-bold tracking-tight">
          <span className="brand-text">{wordmark}</span>
        </span>
      )}
    </span>
  );
}
