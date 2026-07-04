"use client";

import Link from "next/link";
import { ArrowLeft, ListChecks, BarChart3, Mail } from "lucide-react";
import { initials } from "@/lib/tasks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TabNav } from "@/components/tab-nav";

export function UserDetailHeader({
  user,
  labels,
}: {
  user: { id: string; name: string; email: string | null; role: string };
  labels: { back: string; tasks: string; performance: string };
}) {
  return (
    <div className="mb-6 space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {labels.back}
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-br from-indigo-500/5 to-emerald-500/5 p-5 shadow-sm">
        <Avatar className="h-16 w-16 border-2 border-white shadow">
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-pink-500 text-xl text-white">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
            <Badge variant={user.role === "Admin" ? "default" : "secondary"}>
              {user.role}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            {user.email ?? "—"}
          </p>
        </div>
      </div>

      <TabNav
        tabs={[
          {
            href: `/admin/users/${user.id}`,
            label: labels.tasks,
            icon: ListChecks,
          },
          {
            href: `/admin/users/${user.id}/performance`,
            label: labels.performance,
            icon: BarChart3,
          },
        ]}
      />
    </div>
  );
}
