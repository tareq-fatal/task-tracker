import "server-only";
import { prisma } from "./prisma";
import { instanceUrl } from "./instance-url";

// Telegram Bot API — direct HTTP calls, no external service. Enabled only when
// TELEGRAM_BOT_TOKEN is set (kept in the server env, never in git).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

export const telegramEnabled = Boolean(TOKEN);
export const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || null;

// TOF-0795: Fallback aus src/lib/instance-url.ts (APP_URL > … > Build-Adresse).
const APP_URL = process.env.APP_BASE_URL || instanceUrl();

export type TelegramSendResult = { ok: boolean; status?: number };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Low-level send. Best-effort; logs outcome like the web-push sender. */
export async function sendTelegramMessage(
  chatId: string,
  html: string,
  opts?: { url?: string; urlLabel?: string }
): Promise<TelegramSendResult> {
  if (!API) return { ok: false };
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (opts?.url) {
      body.reply_markup = {
        inline_keyboard: [[{ text: opts.urlLabel ?? "Open", url: opts.url }]],
      };
    }
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.info(`[telegram] sent to chat ${chatId} → ${res.status}`);
      return { ok: true, status: res.status };
    }
    const errBody = await res.text().catch(() => "");
    console.error(`[telegram] FAILED to chat ${chatId} → ${res.status} ${errBody.slice(0, 200)}`);
    // 403 = user blocked the bot → unlink so we stop trying.
    if (res.status === 403) {
      await prisma.user
        .updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } })
        .catch(() => {});
    }
    return { ok: false, status: res.status };
  } catch (e) {
    console.error(`[telegram] send error: ${String(e).slice(0, 200)}`);
    return { ok: false };
  }
}

/** Localized inline-button label for the task link. */
function openLabel(locale: string): string {
  if (locale === "de") return "Aufgabe öffnen";
  if (locale === "en") return "Open task";
  if (locale === "tr") return "Görevi aç";
  return "فتح المهمة";
}

/**
 * Optional per-tenant broadcast group (Weg 2). Telegram forbids bots from
 * adding members, so the group is created manually and the bot added as admin;
 * the tenant stores the group chat id + the CSV of event types to mirror.
 * Called ONCE per event from notifyMany (not per recipient).
 */
export async function broadcastToTelegramGroup(
  tenantId: string,
  eventType: string,
  payload: { title: string; body?: string; url?: string }
): Promise<void> {
  if (!telegramEnabled) return;
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { telegramGroupChatId: true, telegramGroupEvents: true },
    });
    if (!tenant?.telegramGroupChatId) return;
    const events = (tenant.telegramGroupEvents ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!events.includes(eventType)) return;
    const text = `<b>${esc(payload.title)}</b>` + (payload.body ? `\n${esc(payload.body)}` : "");
    let url: string | undefined;
  if (payload.url) {
    const u = new URL(payload.url, APP_URL);
    u.searchParams.set("src", "tg"); // read-receipt source attribution
    url = u.toString();
  }
    await sendTelegramMessage(tenant.telegramGroupChatId, text, { url, urlLabel: "فتح المهمة" });
  } catch {
    /* best-effort */
  }
}

/**
 * Notification fan-out target — called from notify() when the webPush channel
 * is active (Telegram deliberately follows the same triggers as push). Skips
 * silently when the user has no linked chat or muted the bot.
 */
export async function notifyUserTelegram(
  userId: string,
  payload: { title: string; body?: string; url?: string }
): Promise<void> {
  if (!telegramEnabled) return;
  let user: { telegramChatId: string | null; telegramMuted: boolean; locale: string } | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true, telegramMuted: true, locale: true },
    });
  } catch {
    return;
  }
  if (!user?.telegramChatId || user.telegramMuted) return; // not linked / muted → skip, no error

  const text =
    `<b>${esc(payload.title)}</b>` + (payload.body ? `\n${esc(payload.body)}` : "");
  let url: string | undefined;
  if (payload.url) {
    const u = new URL(payload.url, APP_URL);
    u.searchParams.set("src", "tg"); // read-receipt source attribution
    url = u.toString();
  }
  await sendTelegramMessage(user.telegramChatId, text, {
    url,
    urlLabel: openLabel(user.locale),
  });
}
