// Pure visual mapping for notification types → an icon key + coloured chip.
// Deliberately free of React/lucide imports so it stays unit-testable; the
// notification bell resolves the icon key to a lucide component.

export type NotifVisual = {
  /** lucide icon key, resolved in notification-bell.tsx */
  icon: string;
  /** filled circle background — One-UI-style coloured chip */
  circle: string;
};

const VISUALS: Record<string, NotifVisual> = {
  assigned: { icon: "user-plus", circle: "bg-indigo-500" },
  status: { icon: "refresh-cw", circle: "bg-sky-500" },
  review: { icon: "search-check", circle: "bg-fuchsia-500" },
  comment: { icon: "message-square", circle: "bg-blue-500" },
  mention: { icon: "at-sign", circle: "bg-violet-500" },
  due_soon: { icon: "clock", circle: "bg-amber-500" },
  overdue: { icon: "alert-triangle", circle: "bg-red-500" },
  blocker_resolved: { icon: "shield-check", circle: "bg-emerald-500" },
  recurring: { icon: "repeat", circle: "bg-teal-500" },
  admin_activity: { icon: "activity", circle: "bg-slate-500" },
};

const FALLBACK: NotifVisual = { icon: "bell", circle: "bg-gray-400" };

export function notifVisual(type: string): NotifVisual {
  return VISUALS[type] ?? FALLBACK;
}
