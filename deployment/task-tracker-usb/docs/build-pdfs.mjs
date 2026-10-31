/**
 * Task Tracker on-prem package — builds docs/INSTALL_DE.pdf, docs/INSTALL_EN.pdf
 * and docs/INSTALL_AR.pdf.
 *
 *   node deployment/task-tracker-usb/docs/build-pdfs.mjs
 *
 * TOF-0794: EXACTLY two A4 pages per language — hardware,
 * offline installation step by step (TLS internal, root certificate, invite
 * link), name/logo, backup, restore, update/rollback. The script checks the
 * page count and fails if a guide does not come out at 2 pages.
 *
 * TOF-0795: third language (English); installation through
 * the one-file installer `sudo bash task-tracker-onprem-<version>.run` with its
 * four questions (name, logo, language, address); support contact and the
 * reference to NUTZUNGSHINWEISE.md. No customer names in the examples.
 *
 * Rendered with Chromium so the Arabic edition gets proper RTL shaping and bidi
 * handling for free — no reshaper library, no font juggling. Browser: the repo's
 * Playwright Chromium; if that is not installed, a local Chrome (TT_CHROME=<path>
 * or the usual install locations).
 *
 * The HTML sources are written next to the PDFs (install-de.html,
 * install-en.html, install-ar.html) so a guide is always inspectable. Only the
 * PDFs go into the package.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = resolve(HERE, "..");
const VERSION = readFileSync(join(BUNDLE, "VERSION"), "utf8").trim();
const RUN = `task-tracker-onprem-${VERSION}.run`;
const EXPECTED_PAGES = 2;
const SUPPORT = "TOF Solution · Tarek@tarekfatal.com";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Inline markup: `code` → <code dir="ltr">, **bold** → <b>. Escapes first. */
const md = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

const COPY_CMD = `cp /media/$USER/USB/${RUN}* ~/ && cd ~\nsha256sum -c ${RUN}.sha256`;
const RUN_CMD = `sudo bash ${RUN}`;

// --- Content -------------------------------------------------------------------
// One object per language with the same structure, so the editions cannot drift.
const L = {
  de: {
    dir: "ltr",
    lang: "de",
    font: `"Segoe UI", "Helvetica Neue", Arial, sans-serif`,
    title: "Task Tracker — Installation auf dem eigenen Server",
    sub: `Installationsdatei ${RUN} · auch ganz ohne Internet · Ubuntu 22.04 / 24.04`,
    hwTitle: "1  Was Sie brauchen",
    hwHead: ["", "Mindestens", "Empfohlen"],
    hwRows: [
      ["Prozessor", "2 Kerne (x86_64 oder ARM64)", "4 Kerne"],
      ["Arbeitsspeicher", "4 GB", "8 GB"],
      ["Festplatte", "20 GB frei", "50 GB SSD"],
      ["System", "Ubuntu 22.04 oder 24.04, Zugang mit sudo", ""],
      ["Netzwerk", "Ports 80 und 443 frei; feste LAN-IP empfohlen", ""],
    ],
    hwNote:
      "Docker wird automatisch installiert (offline aus dem Paket). Daten verlassen den Server nicht — keine Cloud, kein Zugang von außen.",
    instTitle: "2  Installation Schritt für Schritt (ohne Internet)",
    steps: [
      [
        "Datei kopieren und prüfen",
        `USB-Stick anschließen, die Datei \`${RUN}\` (und \`.sha256\`) auf den Server kopieren; die Prüfung muss „OK“ melden:`,
        COPY_CMD,
      ],
      [
        "Installation starten",
        "Ein Befehl, dann vier Fragen — Enter übernimmt den Vorschlag: **Name** der Oberfläche, **Logo** (optional, Pfad zu PNG/JPG/WEBP/SVG), **Sprache** (`ar`, `de`, `en`), **Adresse** (Hostname optional, IP wird erkannt).",
        RUN_CMD,
      ],
      [
        "Warten (3–5 Minuten)",
        "Am Ende zeigt der Installer **Adresse, Benutzername, Einladungslink** und **Pfad + Fingerabdruck des Zertifikats**. Alles steht auch in `/opt/task-tracker/ACCESS.txt` (nur root): `sudo cat /opt/task-tracker/ACCESS.txt`",
        null,
      ],
      [
        "Zertifikat importieren — einmal je Gerät",
        "Der Server stellt seine HTTPS-Zertifikate selbst aus. Damit Browser ihm vertrauen, die Datei `/opt/task-tracker/ca/task-tracker-root-ca.crt` (oder Download `http://<Server-IP>/ca.crt`) importieren und den Fingerabdruck vergleichen:",
        null,
      ],
      [
        "Einladungslink öffnen",
        "Link im Browser öffnen, Passwort wählen — fertig, Sie sind als Superuser angemeldet. Der Link gilt **nur einmal** und 72 Stunden. Abgelaufen? `sudo /opt/task-tracker/invite.sh` erzeugt einen neuen.",
        null,
      ],
    ],
    certRows: [
      ["Windows", "Datei doppelklicken → Zertifikat installieren → Lokaler Computer → „Alle Zertifikate in folgendem Speicher“ → Vertrauenswürdige Stammzertifizierungsstellen."],
      ["Android", "Einstellungen → Sicherheit → Verschlüsselung & Anmeldedaten → Zertifikat installieren → CA-Zertifikat."],
      ["iPhone/iPad", "Download-Link in Safari öffnen → Einstellungen → Profil installieren; dann Allgemein → Info → Zertifikatsvertrauenseinstellungen → einschalten."],
    ],
    otherModes:
      "Ohne Fragen: `sudo bash RUN -- --app-name \"Mein Team\" --locale de --yes`. Mit Internet und eigener Domain (Online-Paket): `sudo ./install.sh --tls domain --domain tasks.firma.de`.",
    nameTitle: "3  Name, Logo, Sprache",
    nameRows: [
      ["Name", "Frage 1 bei der Installation. Später ändern: `APP_NAME=…` in `/opt/task-tracker/.env`, dann `sudo ./update.sh --restart`. Leer = Standardname je Sprache."],
      ["Logo, Farben", "Logo: Frage 2 (max. 2 MB). Später in der App als Superuser: **Einstellungen → Branding**. Wird mitgesichert."],
      ["Sprache", "Frage 3 — Sprache der Anmeldeseite und des Superusers. Jeder Benutzer kann seine Sprache selbst umstellen."],
    ],
    opsIntro: "Alle Befehle im Ordner `/opt/task-tracker` ausführen: `cd /opt/task-tracker`",
    backupTitle: "4  Sicherung (Backup)",
    backupRows: [
      ["automatisch", "jede Nacht um **03:30**, die letzten 14 bleiben in `/var/backups/task-tracker`"],
      ["`sudo ./backup.sh`", "sofort eine Sicherung erstellen"],
      ["`sudo ./backup.sh --to /media/$USER/USB`", "Sicherung direkt auf einen USB-Stick schreiben"],
    ],
    backupWarn:
      "Regelmäßig eine Sicherung auf USB kopieren — eine Sicherung auf demselben Server hilft nicht, wenn der Server ausfällt. Sicherungen sind nicht verschlüsselt und enthalten alle Passwörter: sicher aufbewahren.",
    restoreTitle: "5  Wiederherstellen",
    restoreRows: [
      ["`sudo ./restore.sh`", "vorhandene Sicherungen anzeigen"],
      ["`sudo ./restore.sh --from latest --yes`", "die neueste Sicherung zurückspielen"],
      ["`sudo ./restore.sh --from /media/$USER/USB/20261031-033000 --yes`", "eine Sicherung vom USB-Stick zurückspielen"],
    ],
    restoreNote:
      "Vorher wird der aktuelle Stand automatisch gesichert (`pre-restore-…`) — eine falsche Wiederherstellung lässt sich rückgängig machen.",
    updateTitle: "6  Update und Rollback",
    updateRows: [
      ["`sudo bash task-tracker-onprem-<neu>.run`", "neue Version: erkennt die Installation und bietet das Update an"],
      ["`sudo ./update.sh --rollback`", "das letzte Update rückgängig machen"],
      ["`sudo ./update.sh --restart`", "nur neu starten (z. B. nach Änderung der `.env`)"],
    ],
    updateNote:
      "Jedes Update sichert zuerst alles. Startet die neue Version nicht sauber, läuft automatisch wieder die alte.",
    helpTitle: "7  Wenn etwas nicht klappt",
    helpRows: [
      ["Zertifikatswarnung", "Zertifikat auf dem Gerät noch nicht importiert (Schritt 4) — oder eine andere Adresse geöffnet als bei der Installation angegeben."],
      ["Seite nicht erreichbar", "`sudo docker compose ps` — alle drei Dienste „running“, app „healthy“. Protokoll: `sudo docker compose logs -f app`"],
      ["Link abgelaufen / Passwort vergessen", "`sudo ./invite.sh` (für andere Benutzer: `--user NAME`)"],
      ["„Checksum MISMATCH“", "Die `.run`-Datei ist beschädigt — erneut kopieren."],
    ],
    supportNote: `**Support:** ${SUPPORT} · Nutzungshinweise: \`NUTZUNGSHINWEISE.md\` (im Paket und in \`/opt/task-tracker\`)`,
    footer: `Task Tracker On-Premise ${VERSION}`,
  },

  en: {
    dir: "ltr",
    lang: "en",
    font: `"Segoe UI", "Helvetica Neue", Arial, sans-serif`,
    title: "Task Tracker — installation on your own server",
    sub: `Installer file ${RUN} · works without any internet · Ubuntu 22.04 / 24.04`,
    hwTitle: "1  What you need",
    hwHead: ["", "Minimum", "Recommended"],
    hwRows: [
      ["Processor", "2 cores (x86_64 or ARM64)", "4 cores"],
      ["Memory", "4 GB", "8 GB"],
      ["Disk", "20 GB free", "50 GB SSD"],
      ["System", "Ubuntu 22.04 or 24.04, access with sudo", ""],
      ["Network", "ports 80 and 443 free; fixed LAN IP recommended", ""],
    ],
    hwNote:
      "Docker is installed automatically (offline from the package). Data never leaves the server — no cloud, no access from outside.",
    instTitle: "2  Installation step by step (no internet)",
    steps: [
      [
        "Copy and check the file",
        `Plug in the USB stick, copy \`${RUN}\` (and \`.sha256\`) to the server; the check must report “OK”:`,
        COPY_CMD,
      ],
      [
        "Start the installation",
        "One command, then four questions — Enter keeps the suggestion: **name** of the interface, **logo** (optional, path to PNG/JPG/WEBP/SVG), **language** (`ar`, `de`, `en`), **address** (host name optional, IP is detected).",
        RUN_CMD,
      ],
      [
        "Wait (3–5 minutes)",
        "At the end the installer shows the **address, user name, invite link** and the **path + fingerprint of the certificate**. Everything is also in `/opt/task-tracker/ACCESS.txt` (root only): `sudo cat /opt/task-tracker/ACCESS.txt`",
        null,
      ],
      [
        "Import the certificate — once per device",
        "The server issues its own HTTPS certificates. For browsers to trust it, import `/opt/task-tracker/ca/task-tracker-root-ca.crt` (or download `http://<server-IP>/ca.crt`) and compare the fingerprint:",
        null,
      ],
      [
        "Open the invite link",
        "Open the link in the browser and choose a password — done, you are logged in as superuser. The link works **once only** and for 72 hours. Expired? `sudo /opt/task-tracker/invite.sh` creates a new one.",
        null,
      ],
    ],
    certRows: [
      ["Windows", "Double-click the file → Install Certificate → Local Machine → “Place all certificates in the following store” → Trusted Root Certification Authorities."],
      ["Android", "Settings → Security → Encryption & credentials → Install a certificate → CA certificate."],
      ["iPhone/iPad", "Open the download link in Safari → Settings → install the profile; then General → About → Certificate Trust Settings → switch on."],
    ],
    otherModes:
      "Without questions: `sudo bash RUN -- --app-name \"My Team\" --locale en --yes`. With internet and your own domain (online package): `sudo ./install.sh --tls domain --domain tasks.example.com`.",
    nameTitle: "3  Name, logo, language",
    nameRows: [
      ["Name", "Question 1 of the installation. Change it later: `APP_NAME=…` in `/opt/task-tracker/.env`, then `sudo ./update.sh --restart`. Empty = default name per language."],
      ["Logo, colours", "Logo: question 2 (max. 2 MB). Later in the app as superuser: **Settings → Branding**. Included in backups."],
      ["Language", "Question 3 — language of the login page and of the superuser. Every user can switch their own language."],
    ],
    opsIntro: "Run all commands in the folder `/opt/task-tracker`: `cd /opt/task-tracker`",
    backupTitle: "4  Backup",
    backupRows: [
      ["automatic", "every night at **03:30**, the last 14 are kept in `/var/backups/task-tracker`"],
      ["`sudo ./backup.sh`", "make a backup now"],
      ["`sudo ./backup.sh --to /media/$USER/USB`", "write the backup straight to a USB stick"],
    ],
    backupWarn:
      "Copy a backup to USB regularly — a backup on the same server does not help if the server fails. Backups are not encrypted and contain every password: keep them safe.",
    restoreTitle: "5  Restore",
    restoreRows: [
      ["`sudo ./restore.sh`", "list the available backups"],
      ["`sudo ./restore.sh --from latest --yes`", "restore the newest backup"],
      ["`sudo ./restore.sh --from /media/$USER/USB/20261031-033000 --yes`", "restore a backup from a USB stick"],
    ],
    restoreNote:
      "The current state is saved automatically first (`pre-restore-…`) — a wrong restore can be undone.",
    updateTitle: "6  Update and rollback",
    updateRows: [
      ["`sudo bash task-tracker-onprem-<new>.run`", "new version: detects the installation and offers the update"],
      ["`sudo ./update.sh --rollback`", "undo the last update"],
      ["`sudo ./update.sh --restart`", "restart only (e.g. after editing `.env`)"],
    ],
    updateNote:
      "Every update backs up everything first. If the new version does not start cleanly, the old one runs again automatically.",
    helpTitle: "7  If something does not work",
    helpRows: [
      ["Certificate warning", "Certificate not imported on that device yet (step 4) — or an address was opened other than the one given at installation."],
      ["Site not reachable", "`sudo docker compose ps` — all three services “running”, app “healthy”. Log: `sudo docker compose logs -f app`"],
      ["Link expired / password forgotten", "`sudo ./invite.sh` (for other users: `--user NAME`)"],
      ["“Checksum MISMATCH”", "The `.run` file is damaged — copy it again."],
    ],
    supportNote: `**Support:** ${SUPPORT} · Terms of use: \`NUTZUNGSHINWEISE.md\` (in the package and in \`/opt/task-tracker\`)`,
    footer: `Task Tracker On-Premise ${VERSION}`,
  },

  ar: {
    dir: "rtl",
    lang: "ar",
    font: `"Segoe UI", "Tahoma", "Arial", sans-serif`,
    title: "متتبِّع المهام — التثبيت على خادمك الخاص",
    sub: `ملف التثبيت ${RUN} · يعمل حتى دون أي اتصال بالإنترنت · Ubuntu 22.04 / 24.04`,
    hwTitle: "١  ما تحتاج إليه",
    hwHead: ["", "الحد الأدنى", "المُوصى به"],
    hwRows: [
      ["المعالج", "نواتان (x86_64 أو ARM64)", "٤ أنوية"],
      ["الذاكرة", "4 GB", "8 GB"],
      ["القرص", "20 GB مساحة فارغة", "50 GB SSD"],
      ["النظام", "Ubuntu 22.04 أو 24.04 مع صلاحية sudo", ""],
      ["الشبكة", "المنفذان 80 و 443 غير مستخدمَين؛ يُفضَّل عنوان IP ثابت في الشبكة المحلية", ""],
    ],
    hwNote:
      "يُثبَّت Docker تلقائيًا (دون إنترنت من داخل الحزمة). لا تغادر البيانات الخادم — لا سحابة ولا وصول من الخارج.",
    instTitle: "٢  التثبيت خطوة بخطوة (دون إنترنت)",
    steps: [
      [
        "نسخ الملف والتحقق منه",
        `صِل ذاكرة USB وانسخ الملف \`${RUN}\` (والملف \`.sha256\`) إلى الخادم؛ يجب أن يُظهر التحقق «OK»:`,
        COPY_CMD,
      ],
      [
        "بدء التثبيت",
        "أمر واحد ثم أربعة أسئلة — زر Enter يقبل الاقتراح: **اسم** الواجهة، **الشعار** (اختياري، مسار ملف PNG/JPG/WEBP/SVG)، **اللغة** (`ar` أو `de` أو `en`)، **العنوان** (اسم الخادم اختياري، ويُكتشف عنوان IP تلقائيًا).",
        RUN_CMD,
      ],
      [
        "الانتظار (٣ إلى ٥ دقائق)",
        "في النهاية يعرض البرنامج **العنوان واسم المستخدم ورابط الدعوة** و**مسار الشهادة وبصمتها**. كل ذلك محفوظ أيضًا في `/opt/task-tracker/ACCESS.txt` (لمدير النظام فقط): `sudo cat /opt/task-tracker/ACCESS.txt`",
        null,
      ],
      [
        "استيراد الشهادة — مرة واحدة لكل جهاز",
        "يُصدر الخادم شهادات HTTPS بنفسه. ليثق بها المتصفح، استورد الملف `/opt/task-tracker/ca/task-tracker-root-ca.crt` (أو نزّله من `http://<Server-IP>/ca.crt`) وقارن البصمة:",
        null,
      ],
      [
        "فتح رابط الدعوة",
        "افتح الرابط في المتصفح واختر كلمة مرور — وبهذا تكون مسجّلًا كمستخدم أعلى (Superuser). الرابط صالح **لمرة واحدة فقط** ولمدة ٧٢ ساعة. انتهت صلاحيته؟ الأمر `sudo /opt/task-tracker/invite.sh` يُنشئ رابطًا جديدًا.",
        null,
      ],
    ],
    certRows: [
      ["Windows", "انقر نقرًا مزدوجًا على الملف ← تثبيت الشهادة ← الكمبيوتر المحلي ← «وضع كل الشهادات في المخزن التالي» ← جهات إصدار الشهادات الجذر الموثوق بها."],
      ["Android", "الإعدادات ← الأمان ← التشفير وبيانات الاعتماد ← تثبيت شهادة ← شهادة CA."],
      ["iPhone/iPad", "افتح رابط التنزيل في Safari ← الإعدادات ← تثبيت ملف التعريف؛ ثم عام ← حول ← إعدادات الثقة بالشهادات ← تفعيل."],
    ],
    otherModes:
      "دون أسئلة: `sudo bash RUN -- --app-name \"My Team\" --locale ar --yes`. مع إنترنت ونطاق خاص (الحزمة المتصلة): `sudo ./install.sh --tls domain --domain tasks.example.com`.",
    nameTitle: "٣  الاسم والشعار واللغة",
    nameRows: [
      ["الاسم", "السؤال ١ أثناء التثبيت. لتغييره لاحقًا: `APP_NAME=…` في `/opt/task-tracker/.env` ثم `sudo ./update.sh --restart`. فارغ = الاسم الافتراضي لكل لغة."],
      ["الشعار والألوان", "الشعار: السؤال ٢ (حتى 2 MB). لاحقًا داخل التطبيق كمستخدم أعلى: **الإعدادات ← الهوية**. يُحفظ ضمن النسخ الاحتياطية."],
      ["اللغة", "السؤال ٣ — لغة صفحة الدخول ولغة المستخدم الأعلى. ويستطيع كل مستخدم تغيير لغته بنفسه."],
    ],
    opsIntro: "نفّذ كل الأوامر داخل المجلد `/opt/task-tracker`: ‏`cd /opt/task-tracker`",
    backupTitle: "٤  النسخ الاحتياطي",
    backupRows: [
      ["تلقائيًا", "كل ليلة الساعة **03:30**، ويُحتفظ بآخر ١٤ نسخة في `/var/backups/task-tracker`"],
      ["`sudo ./backup.sh`", "إنشاء نسخة احتياطية الآن"],
      ["`sudo ./backup.sh --to /media/$USER/USB`", "كتابة النسخة مباشرة على ذاكرة USB"],
    ],
    backupWarn:
      "انسخ نسخة احتياطية إلى ذاكرة USB بانتظام — النسخة الموجودة على الخادم نفسه لا تنفع إذا تعطّل الخادم. النسخ غير مشفّرة وتحتوي على كل كلمات المرور: احفظها في مكان آمن.",
    restoreTitle: "٥  الاستعادة",
    restoreRows: [
      ["`sudo ./restore.sh`", "عرض النسخ الاحتياطية المتاحة"],
      ["`sudo ./restore.sh --from latest --yes`", "استعادة أحدث نسخة"],
      ["`sudo ./restore.sh --from /media/$USER/USB/20261031-033000 --yes`", "استعادة نسخة من ذاكرة USB"],
    ],
    restoreNote:
      "قبل ذلك تُحفظ الحالة الحالية تلقائيًا (`pre-restore-…`) — لذا يمكن التراجع عن استعادة خاطئة.",
    updateTitle: "٦  التحديث والتراجع",
    updateRows: [
      ["`sudo bash task-tracker-onprem-<new>.run`", "إصدار جديد: يتعرّف على التثبيت الحالي ويعرض التحديث"],
      ["`sudo ./update.sh --rollback`", "التراجع عن آخر تحديث"],
      ["`sudo ./update.sh --restart`", "إعادة التشغيل فقط (مثلًا بعد تعديل ملف `.env`)"],
    ],
    updateNote:
      "كل تحديث يبدأ بنسخة احتياطية كاملة. وإذا لم يعمل الإصدار الجديد بشكل سليم، يعود الإصدار القديم تلقائيًا.",
    helpTitle: "٧  إذا لم يعمل شيء ما",
    helpRows: [
      ["تحذير الشهادة", "لم تُستورد الشهادة على هذا الجهاز بعد (الخطوة ٤) — أو فُتح عنوان غير الذي حُدِّد أثناء التثبيت."],
      ["الصفحة غير متاحة", "`sudo docker compose ps` — يجب أن تكون الخدمات الثلاث running و app بحالة healthy. السجل: `sudo docker compose logs -f app`"],
      ["انتهت صلاحية الرابط / نسيت كلمة المرور", "`sudo ./invite.sh` (لمستخدم آخر: `--user NAME`)"],
      ["«Checksum MISMATCH»", "ملف `.run` تالف — انسخه مرة أخرى."],
    ],
    supportNote: `**الدعم:** ${SUPPORT} · شروط الاستخدام: \`NUTZUNGSHINWEISE.md\` (داخل الحزمة وفي \`/opt/task-tracker\`)`,
    footer: `Task Tracker On-Premise ${VERSION}`,
  },
};
for (const t of Object.values(L)) t.otherModes = t.otherModes.replace("RUN", RUN);

// --- Rendering -------------------------------------------------------------------
const table = (rows, { codeFirst = false, head = null, cls = "" } = {}) => `
<table class="${cls}">
  ${head ? `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : ""}
  <tbody>
    ${rows
      .map(
        (r) =>
          `<tr>${r
            .map((c, i) =>
              i === 0
                ? `<th>${codeFirst ? md(c) : md(c)}</th>`
                : `<td>${md(c)}</td>`
            )
            .join("")}</tr>`
      )
      .join("\n")}
  </tbody>
</table>`;

function buildHtml(t) {
  const start = t.dir === "rtl" ? "right" : "left";
  const steps = t.steps
    .map(
      ([title, body, cmd], i) => `
    <li>
      <div class="st"><span class="num">${i + 1}</span><b>${esc(title)}</b></div>
      <p>${md(body)}</p>
      ${cmd ? `<pre class="cmd" dir="ltr">${esc(cmd)}</pre>` : ""}
      ${i === 3 ? table(t.certRows, { cls: "cert" }) : ""}
    </li>`
    )
    .join("");

  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<title>${esc(t.title)}</title>
<style>
  @page { size: A4; margin: 11mm 12mm 13mm 12mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${t.font}; font-size: 8.9pt; line-height: 1.42; color: #1e293b; margin: 0; }
  .page { height: 272mm; overflow: hidden; display: flex; flex-direction: column; gap: 2.2mm; }
  .page + .page { break-before: page; }
  header { border-bottom: 3px solid #0ea5e9; padding-bottom: 2mm; }
  h1 { font-size: 15pt; margin: 0 0 1mm; color: #0f172a; }
  .sub { color: #0369a1; font-size: 9pt; }
  h2 { font-size: 11pt; margin: 1.5mm 0 1mm; color: #0f172a; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 0.8mm; }
  p { margin: 0 0 1mm; }
  code { font-family: "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace; font-size: 8pt;
         background: #f1f5f9; border-radius: 3px; padding: 0 3px; color: #0f172a; unicode-bidi: isolate; }
  pre.cmd { font-family: "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace; font-size: 8.6pt;
            background: #0f172a; color: #e2e8f0; border-radius: 5px; padding: 1.6mm 2.6mm; margin: 1mm 0 0;
            white-space: pre-wrap; text-align: left; border-inline-start: 3px solid #0ea5e9; }
  table { width: 100%; border-collapse: collapse; margin: 0.6mm 0 0.6mm; }
  th, td { border: 1px solid #e2e8f0; padding: 1mm 2mm; text-align: ${start}; vertical-align: top; font-weight: normal; }
  tbody th { background: #f8fafc; font-weight: 600; width: 30%; }
  thead th { background: #e0f2fe; font-weight: 600; }
  table.hw tbody th { width: 22%; }
  table.cert th { width: 17%; }
  table.cert { font-size: 8.3pt; }
  table.ops tbody th { width: 52%; font-weight: normal; }
  ol.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.8mm; }
  .st { margin-bottom: 0.6mm; font-size: 9.6pt; }
  .num { display: inline-block; width: 5.2mm; height: 5.2mm; line-height: 5.2mm; text-align: center;
         background: #0ea5e9; color: #fff; border-radius: 50%; font-size: 8.4pt; margin-inline-end: 2mm; }
  .note, .warn { border-radius: 5px; padding: 1.4mm 2.6mm; margin: 0.8mm 0; font-size: 8.5pt; }
  .note { background: #f0f9ff; border-inline-start: 3px solid #0ea5e9; }
  .warn { background: #fffbeb; border-inline-start: 3px solid #f59e0b; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 5mm; }
  .foot { margin-top: auto; color: #94a3b8; font-size: 7.4pt; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<section class="page">
  <header>
    <h1>${esc(t.title)}</h1>
    <div class="sub">${esc(t.sub)}</div>
  </header>

  <h2>${esc(t.hwTitle)}</h2>
  ${table(t.hwRows.map((r) => r.slice()), { head: t.hwHead, cls: "hw" })}
  <p class="note">${md(t.hwNote)}</p>

  <h2>${esc(t.instTitle)}</h2>
  <ol class="steps">${steps}</ol>
  <p class="note">${md(t.otherModes)}</p>
  <div class="foot"><span>${esc(t.footer)}</span><span dir="ltr">1 / 2</span></div>
</section>

<section class="page">
  <h2>${esc(t.nameTitle)}</h2>
  ${table(t.nameRows)}

  <p class="note">${md(t.opsIntro)}</p>

  <h2>${esc(t.backupTitle)}</h2>
  ${table(t.backupRows, { cls: "ops" })}
  <p class="warn">${md(t.backupWarn)}</p>

  <h2>${esc(t.restoreTitle)}</h2>
  ${table(t.restoreRows, { cls: "ops" })}
  <p class="note">${md(t.restoreNote)}</p>

  <h2>${esc(t.updateTitle)}</h2>
  ${table(t.updateRows, { cls: "ops" })}
  <p class="note">${md(t.updateNote)}</p>

  <h2>${esc(t.helpTitle)}</h2>
  ${table(t.helpRows)}
  <p class="note">${md(t.supportNote)}</p>
  <div class="foot"><span>${esc(t.footer)}</span><span dir="ltr">2 / 2</span></div>
</section>

</body>
</html>`;
}

// --- Build -----------------------------------------------------------------------
const OUT = {
  de: join(HERE, "INSTALL_DE.pdf"),
  en: join(HERE, "INSTALL_EN.pdf"),
  ar: join(HERE, "INSTALL_AR.pdf"),
};

async function launch() {
  const candidates = [
    process.env.TT_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  if (!process.env.TT_CHROME) {
    try {
      return await chromium.launch();
    } catch (e) {
      console.warn(`  ! Playwright Chromium not available (${String(e.message).split("\n")[0]}) — trying a local Chrome.`);
    }
  }
  for (const path of candidates) {
    if (existsSync(path)) return chromium.launch({ executablePath: path });
  }
  throw new Error("No Chromium/Chrome found. Install Playwright's Chromium or set TT_CHROME=<path to chrome>.");
}

/** Number of pages in a PDF Chromium wrote (count of page objects). */
function pdfPages(path) {
  const s = readFileSync(path).toString("latin1");
  return (s.match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

async function main() {
  const browser = await launch();
  let bad = 0;
  try {
    for (const lang of ["de", "en", "ar"]) {
      const t = L[lang];
      const html = buildHtml(t);
      // Keep the HTML next to the PDF so the source of a shipped guide is
      // always inspectable without re-running the build.
      writeFileSync(join(HERE, `install-${lang}.html`), html, "utf8");

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      // Overflow check: every .page must fit its fixed A4 height.
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll(".page")].map((el) => el.scrollHeight - el.clientHeight)
      );
      await page.pdf({
        path: OUT[lang],
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page.close();
      const n = pdfPages(OUT[lang]);
      const cut = overflow.some((px) => px > 1);
      console.log(`  ${n === EXPECTED_PAGES && !cut ? "✓" : "✗"} ${OUT[lang]} — ${n} page(s)${cut ? `, content cut off (overflow px: ${overflow.join("/")})` : ""}`);
      if (n !== EXPECTED_PAGES || cut) bad++;
    }
  } finally {
    await browser.close();
  }
  if (bad) {
    console.error(`  ✗ ${bad} guide(s) are not exactly ${EXPECTED_PAGES} full pages — shorten the text.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
