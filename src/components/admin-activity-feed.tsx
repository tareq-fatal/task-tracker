"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AdminActivityItem = {
  id: string;
  type: string;
  detail: string | null;
  createdAt: string;
  userName: string;
  taskId: string;
  taskTitle: string;
};

const DOT: Record<string, string> = {
  created: "bg-sky-500",
  status: "bg-amber-500",
  reopened: "bg-amber-500",
  assigned: "bg-violet-500",
  priority: "bg-rose-500",
  comment: "bg-teal-500",
  due: "bg-slate-400",
  renamed: "bg-indigo-500",
  description: "bg-slate-500",
  storyPoints: "bg-fuchsia-500",
  timer: "bg-emerald-500",
  attachment: "bg-cyan-500",
  creator_changed: "bg-orange-500",
  escalated: "bg-rose-600",
  assist: "bg-indigo-600",
  coaching: "bg-amber-500",
};

// #33/#35 — tenant-wide feed of user changes, filterable by user.
export function AdminActivityFeed({ items }: { items: AdminActivityItem[] }) {
  const { t, locale } = useT();
  const [who, setWho] = useState<string>("");

  const users = [...new Set(items.map((i) => i.userName))].sort();
  const shown = who ? items.filter((i) => i.userName === who) : items;

  return (
    <div>
      <div className="mb-4">
        <select
          aria-label={t("adminActivity.filterUser")}
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">{t("adminActivity.allUsers")}</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-3">
        {shown.map((it) => (
          <li key={it.id} className="flex gap-3 text-sm">
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                DOT[it.type] ?? "bg-slate-400"
              )}
            />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{it.userName}</span>{" "}
              <span className="text-muted-foreground">
                {t(`activity.${it.type}` as never)}
              </span>{" "}
              <Link
                href={`/tasks/${it.taskId}`}
                className="font-medium hover:underline"
              >
                {it.taskTitle}
              </Link>
              {it.detail ? (
                <div className="truncate text-muted-foreground">{it.detail}</div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {formatDateTime(it.createdAt, locale)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
