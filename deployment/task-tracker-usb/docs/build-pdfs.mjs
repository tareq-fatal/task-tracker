/**
 * Task Tracker on-prem package — builds docs/INSTALL_DE.pdf and docs/INSTALL_AR.pdf.
 *
 *   node deployment/task-tracker-usb/docs/build-pdfs.mjs
 *
 * TOF-0794 (Tarek 31.10.2026): EXACTLY two A4 pages per language — hardware,
 * offline installation step by step (TLS internal, root certificate, invite
 * link), name/logo, backup, restore, update/rollback. The script checks the
 * page count and fails if a guide does not come out at 2 pages.
 *
 * Rendered with Chromium so the Arabic edition gets proper RTL shaping and bidi
 * handling for free — no reshaper library, no font juggling. Browser: the repo's
 * Playwright Chromium; if that is not installed, a local Chrome (TT_CHROME=<path>
 * or the usual install locations).
 *
 * The HTML sources are written next to the PDFs (install-de.html,
 * install-ar.html) so a shipped guide is always inspectable.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = resolve(HERE, "..");
const VERSION = readFileSync(join(BUNDLE, "VERSION"), "utf8").trim();
const PKG = `task-tracker-onprem-v${VERSION}`;
const EXPECTED_PAGES = 2;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Inline markup: `code` → <code dir="ltr">, **bold** → <b>. Escapes first. */
const md = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

const INSTALL_CMD = `sudo ./install.sh --offline --tls internal --app-name "Coast Shield" --locale ar`;

// --- Content -------------------------------------------------------------------
// One object per language with the same structure, so the editions cannot drift.
const L = {
  de: {
    dir: "ltr",
    lang: "de",
    font: `"Segoe UI", "Helvetica Neue", Arial, sans-serif`,
    title: "Task Tracker — Installation auf dem eigenen Server",
    sub: `On-Premise-Paket ${PKG} · auch ganz ohne Internet · Ubuntu 22.04 / 24.04`,
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
      "Docker wird automatisch installiert (offline aus dem Paket). Daten verlassen den Server nicht — keine Cloud.",
    instTitle: "2  Installation Schritt für Schritt (ohne Internet)",
    steps: [
      [
        "Ordner kopieren",
        `USB-Stick anschließen und den Ordner \`${PKG}\` auf den Server kopieren, dann hineinwechseln:`,
        `cp -r /media/$USER/USB/${PKG} ~/\ncd ~/${PKG}`,
      ],
      [
        "Installation starten",
        "Ein Befehl. `--locale ar` = Arabisch (oder `de`, `en`). Optional `--host tracker.marine.local` und `--ip 192.168.1.10` — sonst wird die IP automatisch erkannt.",
        INSTALL_CMD,
      ],
      [
        "Warten (3–5 Minuten)",
        "Am Ende zeigt der Installer **Adresse, Benutzername, Einladungslink** und den **Pfad + Fingerabdruck des Zertifikats**. Alles steht auch in `/opt/task-tracker/ACCESS.txt` (nur root): `sudo cat /opt/task-tracker/ACCESS.txt`",
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
      "Mit Internet und eigener Domain: `--tls domain --domain tasks.firma.de` (Let's Encrypt). Nur im geschlossenen LAN ohne Verschlüsselung: `--tls http` (nicht empfohlen).",
    nameTitle: "3  Name, Logo, Sprache",
    nameRows: [
      ["Name", "`--app-name \"Coast Shield\"` — erscheint überall statt „Task Tracker“. Beim Offline-Paket ist der Name bereits eingebaut (Paket mit diesem Namen bestellen)."],
      ["Logo, Farben", "In der App als Superuser: **Einstellungen → Branding → Logo hochladen**. Wird mitgesichert."],
      ["Sprache", "`--locale ar|de|en` — Sprache der Anmeldeseite und des Superusers. Jeder Benutzer kann seine Sprache selbst umstellen."],
    ],
    opsIntro: "Alle Befehle im Ordner `/opt/task-tracker` ausführen: `cd /opt/task-tracker`",
    backupTitle: "4  Sicherung (Backup)",
    backupRows: [
      ["automatisch", "jede Nacht um **03:30**, die letzten 14 bleiben in `/var/backups/task-tracker`"],
      ["`sudo ./backup.sh`", "sofort eine Sicherung erstellen"],
      ["`sudo ./backup.sh --to /media/$USER/USB`", "Sicherung direkt auf einen USB-Stick schreiben"],
    ],
    backupWarn:
      "Regelmäßig eine Sicherung auf USB kopieren — eine Sicherung auf demselben Server hilft nicht, wenn der Server ausfällt. Eine Sicherung enthält alle Passwörter: sicher aufbewahren.",
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
      ["`sudo ./update.sh --from /media/$USER/USB/task-tracker-onprem-v1.2.0`", "neue Version vom USB-Stick einspielen (offline automatisch)"],
      ["`sudo ./update.sh --rollback`", "das letzte Update rückgängig machen"],
      ["`sudo ./update.sh --restart`", "nur neu starten (z. B. nach Änderung der `.env`)"],
    ],
    updateNote:
      "Jedes Update sichert zuerst alles. Startet die neue Version nicht sauber, läuft automatisch wieder die alte.",
    helpTitle: "7  Wenn etwas nicht klappt",
    helpRows: [
      ["Zertifikatswarnung", "Zertifikat auf dem Gerät noch nicht importiert (Schritt 4) — oder eine andere Adresse geöffnet als bei `--host`/`--ip` angegeben."],
      ["Seite nicht erreichbar", "`sudo docker compose ps` — alle drei Dienste „running“, app „healthy“. Protokoll: `sudo docker compose logs -f app`"],
      ["Link abgelaufen / Passwort vergessen", "`sudo ./invite.sh` (für andere Benutzer: `--user NAME`)"],
    ],
    footer: `Task Tracker On-Premise ${VERSION}`,
  },

  ar: {
    dir: "rtl",
    lang: "ar",
    font: `"Segoe UI", "Tahoma", "Arial", sans-serif`,
    title: "متتبِّع المهام — التثبيت على خادمك الخاص",
    sub: `حزمة التثبيت المحلي ${PKG} · تعمل حتى دون أي اتصال بالإنترنت · Ubuntu 22.04 / 24.04`,
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
      "يُثبَّت Docker تلقائيًا (دون إنترنت من داخل الحزمة). لا تغادر البيانات الخادم — لا سحابة.",
    instTitle: "٢  التثبيت خطوة بخطوة (دون إنترنت)",
    steps: [
      [
        "نسخ المجلد",
        `صِل ذاكرة USB وانسخ المجلد \`${PKG}\` إلى الخادم، ثم ادخل إليه:`,
        `cp -r /media/$USER/USB/${PKG} ~/\ncd ~/${PKG}`,
      ],
      [
        "بدء التثبيت",
        "أمر واحد. ‏`--locale ar` تعني العربية (أو `de` أو `en`). اختياريًا `--host tracker.marine.local` و `--ip 192.168.1.10` — وإلا يُكتشف عنوان IP تلقائيًا.",
        INSTALL_CMD,
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
      "مع إنترنت ونطاق خاص: `--tls domain --domain tasks.company.com` (Let's Encrypt). داخل شبكة مغلقة فقط ودون تشفير: `--tls http` (غير مُوصى به).",
    nameTitle: "٣  الاسم والشعار واللغة",
    nameRows: [
      ["الاسم", "`--app-name \"Coast Shield\"` — يظهر في كل مكان بدلًا من «متتبِّع المهام». في الحزمة دون إنترنت يكون الاسم مدمجًا مسبقًا (اطلب الحزمة بهذا الاسم)."],
      ["الشعار والألوان", "داخل التطبيق كمستخدم أعلى: **الإعدادات ← الهوية ← رفع الشعار**. يُحفظ ضمن النسخ الاحتياطية."],
      ["اللغة", "`--locale ar|de|en` — لغة صفحة الدخول ولغة المستخدم الأعلى. ويستطيع كل مستخدم تغيير لغته بنفسه."],
    ],
    opsIntro: "نفّذ كل الأوامر داخل المجلد `/opt/task-tracker`: ‏`cd /opt/task-tracker`",
    backupTitle: "٤  النسخ الاحتياطي",
    backupRows: [
      ["تلقائيًا", "كل ليلة الساعة **03:30**، ويُحتفظ بآخر ١٤ نسخة في `/var/backups/task-tracker`"],
      ["`sudo ./backup.sh`", "إنشاء نسخة احتياطية الآن"],
      ["`sudo ./backup.sh --to /media/$USER/USB`", "كتابة النسخة مباشرة على ذاكرة USB"],
    ],
    backupWarn:
      "انسخ نسخة احتياطية إلى ذاكرة USB بانتظام — النسخة الموجودة على الخادم نفسه لا تنفع إذا تعطّل الخادم. تحتوي النسخة على كل كلمات المرور: احفظها في مكان آمن.",
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
      ["`sudo ./update.sh --from /media/$USER/USB/task-tracker-onprem-v1.2.0`", "تثبيت إصدار جديد من ذاكرة USB (دون إنترنت تلقائيًا)"],
      ["`sudo ./update.sh --rollback`", "التراجع عن آخر تحديث"],
      ["`sudo ./update.sh --restart`", "إعادة التشغيل فقط (مثلًا بعد تعديل ملف `.env`)"],
    ],
    updateNote:
      "كل تحديث يبدأ بنسخة احتياطية كاملة. وإذا لم يعمل الإصدار الجديد بشكل سليم، يعود الإصدار القديم تلقائيًا.",
    helpTitle: "٧  إذا لم يعمل شيء ما",
    helpRows: [
      ["تحذير الشهادة", "لم تُستورد الشهادة على هذا الجهاز بعد (الخطوة ٤) — أو فُتح عنوان غير المحدد في `--host`/`--ip`."],
      ["الصفحة غير متاحة", "`sudo docker compose ps` — يجب أن تكون الخدمات الثلاث running و app بحالة healthy. السجل: `sudo docker compose logs -f app`"],
      ["انتهت صلاحية الرابط / نسيت كلمة المرور", "`sudo ./invite.sh` (لمستخدم آخر: `--user NAME`)"],
    ],
    footer: `Task Tracker On-Premise ${VERSION}`,
  },
};

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
  <div class="foot"><span>${esc(t.footer)}</span><span dir="ltr">2 / 2</span></div>
</section>

</body>
</html>`;
}

// --- Build -----------------------------------------------------------------------
const OUT = {
  de: join(HERE, "INSTALL_DE.pdf"),
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
    for (const lang of ["de", "ar"]) {
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
