import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import {
  getTelegramOnboarding,
  getTelegramGroupSettings,
  listNotificationEvents,
} from "@/actions/telegram";
import { TelegramOnboardingList } from "@/components/telegram-onboarding-list";
import { TelegramGroupSettings } from "@/components/telegram-group-settings";

export const dynamic = "force-dynamic";

/** Admin bulk-onboarding for the Telegram bot: per-user deep links + QR codes
 *  (printable) and the optional broadcast-group configuration. */
export default async function TelegramAdminPage() {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const rows = await getTelegramOnboarding();
  // Server-side QR data-URLs — no client lib, printable as-is.
  const withQr = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      qr: r.link
        ? await QRCode.toDataURL(r.link, { margin: 1, width: 160 })
        : null,
    }))
  );
  const [group, events] = await Promise.all([
    getTelegramGroupSettings(),
    listNotificationEvents(),
  ]);

  return (
    <div className="container max-w-4xl py-6">
      <h1 className="text-2xl font-bold">{t["tg.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["tg.subtitle"]}</p>

      <TelegramOnboardingList rows={withQr} />

      <TelegramGroupSettings initial={group} events={events} />
    </div>
  );
}
