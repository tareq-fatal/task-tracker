"use client";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/tasks";
import { useT } from "@/components/i18n-provider";
import { useRealtime } from "@/components/realtime-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/** Deterministic avatar tint per user so colors are stable across clients. */
const TINTS = [
  "from-indigo-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
  "from-amber-500 to-orange-500",
  "from-violet-500 to-purple-500",
  "from-cyan-500 to-sky-500",
];

export function tintFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

const MAX_AVATARS = 4;

/**
 * "Who is online" — stacked avatars of the tenant's other connected users,
 * fed live by the presence events of the SSE stream. Renders nothing while
 * alone or disconnected (no fake signal).
 */
export function PresenceIndicator({ selfId }: { selfId: string }) {
  const { t } = useT();
  const { connected, online } = useRealtime();

  const others = online.filter((u) => u.id !== selfId);
  if (!connected || others.length === 0) return null;

  const shown = others.slice(0, MAX_AVATARS);
  const extra = others.length - shown.length;
  const names = others.map((u) => u.name).join(", ");

  return (
    <div
      className="hidden items-center sm:flex"
      title={`${t("presence.count", { n: others.length })}: ${names}`}
      aria-label={`${t("presence.count", { n: others.length })}: ${names}`}
    >
      <div className="flex -space-x-2">
        {shown.map((u) => (
          <span key={u.id} className="relative inline-block">
            <Avatar className="h-7 w-7 border-2 border-background">
              <AvatarFallback
                className={cn(
                  "bg-gradient-to-br text-[10px] text-white",
                  tintFor(u.id)
                )}
              >
                {initials(u.name)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -end-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500" />
          </span>
        ))}
        {extra > 0 && (
          <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-secondary text-[10px] font-semibold text-muted-foreground">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
