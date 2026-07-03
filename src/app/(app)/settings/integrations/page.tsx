import { redirect } from "next/navigation";
import { Bot, CalendarSync, MessageSquare, Mail } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";

export default async function IntegrationsPage() {
  const { user } = await requireTenant();
  if (!can(user.role, "editTenantSettings")) redirect("/");
  const t = getDictionary(getActiveLocale());

  const cards = [
    { icon: Bot, name: t["integ.ai.name"], desc: t["integ.ai.desc"] },
    { icon: CalendarSync, name: t["integ.calendar.name"], desc: t["integ.calendar.desc"] },
    { icon: MessageSquare, name: t["integ.slack.name"], desc: t["integ.slack.desc"] },
    { icon: Mail, name: t["integ.email.name"], desc: t["integ.email.desc"] },
  ];

  return (
    <div className="container max-w-3xl py-6">
      <h1 className="text-2xl font-bold">{t["integ.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["integ.subtitle"]}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.name} className="rounded-xl border bg-card p-4 opacity-90" data-testid="integration-card">
            <div className="mb-2 flex items-center justify-between">
              <c.icon className="h-6 w-6 text-indigo-500" />
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {t["integ.notConfigured"]}
              </span>
            </div>
            <p className="font-semibold">{c.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
