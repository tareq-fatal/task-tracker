import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, telegramEnabled } from "@/lib/telegram";

// Telegram webhook. Registered via setWebhook with a secret_token — Telegram
// echoes it in the X-Telegram-Bot-Api-Secret-Token header on every update,
// which is the authenticity check (requests without it are rejected).
// Handles: /start <token> (link), /start, /link <token>, /unlink, /mute,
// /unmute, /help. Always answers 200 so Telegram does not retry-storm.

const L = {
  linked: {
    ar: "✅ تم ربط حسابك بنجاح! ستصلك إشعارات المهام هنا.",
    de: "✅ Konto verknüpft! Aufgaben-Benachrichtigungen kommen jetzt hier an.",
    en: "✅ Account linked! Task notifications will arrive here.",
    tr: "✅ Hesabınız başarıyla bağlandı! Görev bildirimleri buraya gelecek.",
  },
  badToken: {
    ar: "⚠️ رمز الربط غير صالح أو منتهي. افتح التطبيق ← الإعدادات ← «الربط مع تيليغرام» وحاول مجددًا.",
    de: "⚠️ Ungültiger oder abgelaufener Code. App → Einstellungen → „Mit Telegram verbinden“ und erneut versuchen.",
    en: "⚠️ Invalid or expired code. Open the app → Settings → “Connect Telegram” and try again.",
    tr: "⚠️ Bağlantı kodu geçersiz veya süresi dolmuş. Uygulamayı açın ← Ayarlar ← «Telegram'ı bağla» ve tekrar deneyin.",
  },
  start: {
    ar: "مرحبًا 👋 هذا بوت إشعارات متعقب المهام. لربط حسابك: افتح التطبيق ← الإعدادات ← «الربط مع تيليغرام».",
    de: "Hallo 👋 Das ist der Benachrichtigungs-Bot des Task Trackers. Zum Verbinden: App öffnen → Einstellungen → „Mit Telegram verbinden“.",
    en: "Hi 👋 This is the Task Tracker notification bot. To link your account: open the app → Settings → “Connect Telegram”.",
    tr: "Merhaba 👋 Bu, Görev Takibi bildirim botudur. Hesabınızı bağlamak için: Uygulamayı açın ← Ayarlar ← «Telegram'ı bağla».",
  },
  unlinked: {
    ar: "🔌 تم فصل الحساب. لن تصلك إشعارات بعد الآن.",
    de: "🔌 Verbindung getrennt. Du erhältst keine Benachrichtigungen mehr.",
    en: "🔌 Unlinked. You will no longer receive notifications.",
    tr: "🔌 Hesap bağlantısı kesildi. Artık bildirim almayacaksınız.",
  },
  muted: {
    ar: "🔕 تم إيقاف الإشعارات مؤقتًا. أرسل /unmute لإعادتها.",
    de: "🔕 Benachrichtigungen pausiert. /unmute zum Reaktivieren.",
    en: "🔕 Notifications paused. Send /unmute to resume.",
    tr: "🔕 Bildirimler geçici olarak durduruldu. Geri açmak için /unmute gönderin.",
  },
  unmuted: {
    ar: "🔔 عادت الإشعارات للعمل.",
    de: "🔔 Benachrichtigungen wieder aktiv.",
    en: "🔔 Notifications resumed.",
    tr: "🔔 Bildirimler yeniden etkin.",
  },
  help: {
    ar: "الأوامر:\n/start — ربط الحساب\n/unlink — فصل الحساب\n/mute — إيقاف مؤقت\n/unmute — إعادة التفعيل",
    de: "Befehle:\n/start — Konto verbinden\n/unlink — trennen\n/mute — pausieren\n/unmute — reaktivieren",
    en: "Commands:\n/start — link account\n/unlink — unlink\n/mute — pause\n/unmute — resume",
    tr: "Komutlar:\n/start — hesabı bağla\n/unlink — bağlantıyı kes\n/mute — geçici durdur\n/unmute — yeniden etkinleştir",
  },
  notLinked: {
    ar: "هذا الحساب غير مرتبط بعد. افتح التطبيق ← الإعدادات ← «الربط مع تيليغرام».",
    de: "Noch nicht verknüpft. App → Einstellungen → „Mit Telegram verbinden“.",
    en: "Not linked yet. Open the app → Settings → “Connect Telegram”.",
    tr: "Bu hesap henüz bağlı değil. Uygulamayı açın ← Ayarlar ← «Telegram'ı bağla».",
  },
  alreadyLinked: {
    ar: "أنت متصل بالفعل ✅ ستصلك الإشعارات هنا. اكتب /help للأوامر.",
    de: "Du bist bereits verbunden ✅ — Benachrichtigungen kommen hier an. Tippe /help für die Befehle.",
    en: "You are already connected ✅ — notifications arrive here. Type /help for commands.",
    tr: "Zaten bağlısınız ✅ Bildirimler buraya gelecek. Komutlar için /help yazın.",
  },
  unknown: {
    ar: "لم أفهم هذه الرسالة. اكتب /help لعرض الأوامر.",
    de: "Das habe ich nicht verstanden. Tippe /help für die Befehle.",
    en: "I did not understand that. Type /help for the commands.",
    tr: "Bu mesajı anlayamadım. Komutları görmek için /help yazın.",
  },
} as const;

type MsgKey = keyof typeof L;

function msg(key: MsgKey, locale: string | null | undefined): string {
  const l =
    locale === "de" || locale === "en" || locale === "tr" ? locale : "ar";
  return L[key][l];
}

export async function POST(req: NextRequest) {
  if (!telegramEnabled) return NextResponse.json({ ok: true });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const message = update?.message;
  const chatId: string | undefined =
    message?.chat?.id != null ? String(message.chat.id) : undefined;
  const text: string = (message?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  const linkedUser = await prisma.user.findFirst({
    where: { telegramChatId: chatId },
    select: { id: true, locale: true },
  });
  const locale = linkedUser?.locale;

  const [cmd, arg] = text.split(/\s+/, 2);

  if (cmd === "/start" || cmd === "/link") {
    if (arg) {
      const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      let user = await prisma.user.findUnique({
        where: { telegramLinkToken: arg },
        select: { id: true, locale: true, telegramLinkTokenAt: true },
      });
      if (user?.telegramLinkTokenAt && Date.now() - user.telegramLinkTokenAt.getTime() > TOKEN_TTL_MS) {
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramLinkToken: null, telegramLinkTokenAt: null },
        });
        user = null; // expired → treated exactly like an unknown token
      }
      if (user) {
        // Re-linking moves the chat to this user; one chat = one user.
        await prisma.user.updateMany({
          where: { telegramChatId: chatId, id: { not: user.id } },
          data: { telegramChatId: null },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramChatId: chatId, telegramLinkToken: null, telegramMuted: false },
        });
        await sendTelegramMessage(chatId, msg("linked", user.locale));
      } else if (linkedUser) {
        // Stale payload (tokens are one-time and Telegram re-sends the old
        // deep-link parameter on every Start tap) but the chat IS connected —
        // reassure instead of scaring with "invalid token".
        await sendTelegramMessage(chatId, msg("alreadyLinked", locale));
      } else {
        await sendTelegramMessage(chatId, msg("badToken", locale));
      }
    } else {
      // Bare /start: no re-onboarding for an already-connected chat.
      await sendTelegramMessage(chatId, msg(linkedUser ? "alreadyLinked" : "start", locale));
    }
    return NextResponse.json({ ok: true });
  }

  if (cmd === "/unlink") {
    if (linkedUser) {
      await prisma.user.update({ where: { id: linkedUser.id }, data: { telegramChatId: null } });
      await sendTelegramMessage(chatId, msg("unlinked", locale));
    } else {
      await sendTelegramMessage(chatId, msg("notLinked", locale));
    }
    return NextResponse.json({ ok: true });
  }

  if (cmd === "/mute" || cmd === "/unmute") {
    if (linkedUser) {
      await prisma.user.update({
        where: { id: linkedUser.id },
        data: { telegramMuted: cmd === "/mute" },
      });
      await sendTelegramMessage(chatId, msg(cmd === "/mute" ? "muted" : "unmuted", locale));
    } else {
      await sendTelegramMessage(chatId, msg("notLinked", locale));
    }
    return NextResponse.json({ ok: true });
  }

  if (cmd === "/help") {
    await sendTelegramMessage(chatId, msg("help", locale));
    return NextResponse.json({ ok: true });
  }

  // Anything else (free text, typos): one gentle line — the full command list
  // only appears on an explicit /help, not as a reply to every message.
  await sendTelegramMessage(chatId, msg("unknown", locale));
  return NextResponse.json({ ok: true });
}
