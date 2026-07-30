/**
 * Task Tracker USB bundle — builds docs/INSTALL_DE.pdf and docs/INSTALL_AR.pdf.
 *
 *   node deployment/task-tracker-usb/docs/build-pdfs.mjs
 *
 * Rendered with the repo's own Playwright/Chromium so the Arabic edition gets
 * proper RTL shaping and bidi handling for free — no reshaper library, no font
 * juggling. Screenshots are inlined as data URIs so each PDF is one file that
 * can be e-mailed on its own.
 *
 * The terminal output shown in the guides is REAL: assets/install-log.txt is
 * captured from an actual install.sh run in a clean Ubuntu 24.04 container.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = resolve(HERE, "..");
const REPO = resolve(BUNDLE, "..", "..");
const ASSETS = join(HERE, "assets");

const VERSION = readFileSync(join(BUNDLE, "VERSION"), "utf8").trim();

// --- Assets -------------------------------------------------------------------
function dataUri(path) {
  if (!existsSync(path)) {
    console.warn(`  ! missing image, skipped: ${path}`);
    return null;
  }
  const ext = path.endsWith(".jpg") ? "jpeg" : "png";
  return `data:image/${ext};base64,${readFileSync(path).toString("base64")}`;
}

const IMG = {
  loginDe: dataUri(join(REPO, "screenshots", "01-login.png")),
  boardDe: dataUri(join(REPO, "screenshots", "03-board.png")),
  dashDe: dataUri(join(REPO, "screenshots", "02-dashboard.png")),
  loginAr: dataUri(join(REPO, "screenshots", "v3-ar", "01-login.png")),
  boardAr: dataUri(join(REPO, "screenshots", "v3-ar", "03-board.png")),
  dashAr: dataUri(join(REPO, "screenshots", "v3-ar", "02-dashboard.png")),
  // Captured from the instance the tested install.sh run actually produced —
  // one per language, since the login page follows DEFAULT_LOCALE.
  freshDe: dataUri(join(ASSETS, "fresh-install-login-de.png")),
  freshAr: dataUri(join(ASSETS, "fresh-install-login-ar.png")),
};

/** Cut the section between two marker lines out of the captured install log.
 *  `before` pulls in extra leading lines — used to catch the ASCII box drawn
 *  above the "Installation complete" line. */
function logSlice(file, from, to, before = 0) {
  const path = join(ASSETS, file);
  if (!existsSync(path)) return "(no captured output available)";
  const lines = readFileSync(path, "utf8")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !l.startsWith("# ")); // drop the provenance header
  const found = from ? lines.findIndex((l) => l.includes(from)) : 0;
  const start = Math.max(0, (found === -1 ? 0 : found) - before);
  const endRel = to ? lines.slice(start + 1).findIndex((l) => l.includes(to)) : -1;
  const end = endRel === -1 ? lines.length : start + 1 + endRel;
  return lines
    .slice(start, end)
    .join("\n")
    .replace(/\[[0-9;]*m/g, "")
    .trimEnd();
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- Content -------------------------------------------------------------------
// One object per language. Everything user-visible lives here so the two
// editions can never drift apart structurally.
const L = {
  de: {
    dir: "ltr",
    lang: "de",
    font: `"Segoe UI", "Helvetica Neue", Arial, sans-serif`,
    title: "Task Tracker",
    subtitle: "Installationsanleitung",
    edition: `USB-Ausgabe · Version ${VERSION}`,
    coverNote:
      "Diese Anleitung führt Sie Schritt für Schritt durch die Installation von Task Tracker auf Ihrem eigenen Server. Sie brauchen keine Vorkenntnisse — der Installer erledigt alles Weitere.",
    toc: "Inhalt",
    tocItems: [
      "Was Sie brauchen",
      "Was auf dem USB-Stick ist",
      "Schritt 1 — USB-Stick anschließen",
      "Schritt 2 — Installation starten",
      "Schritt 3 — Die drei Fragen",
      "Schritt 4 — Warten",
      "Schritt 5 — Fertig: Ihre Zugangsdaten",
      "Schritt 6 — Erste Anmeldung",
      "Installation ohne Internet",
      "Sicherung, Wiederherstellung, Update",
      "Wenn etwas nicht funktioniert",
    ],
    reqTitle: "Was Sie brauchen",
    reqIntro:
      "Einen Server mit einem der folgenden Betriebssysteme und Zugang als Administrator (root oder sudo).",
    reqRows: [
      ["Betriebssystem", "Ubuntu 22.04, Ubuntu 24.04 oder Debian 12"],
      ["Arbeitsspeicher", "4 GB (mehr ist besser)"],
      ["Festplatte", "20 GB frei"],
      ["Prozessor", "2 Kerne, x86_64 oder ARM64"],
      ["Netzwerk", "Ports 80 und 443 müssen frei sein"],
      ["Zugang", "root oder ein Benutzer mit sudo-Rechten"],
    ],
    reqNote:
      "Docker wird automatisch installiert, falls es noch nicht vorhanden ist. Sie müssen nichts vorbereiten.",
    domainTitle: "Optional: eine Domain",
    domainBody:
      "Wenn Sie einen Domainnamen haben (z. B. aufgaben.ihre-firma.de), der auf diesen Server zeigt, richtet der Installer automatisch ein HTTPS-Zertifikat ein — kostenlos und selbsterneuernd. Ohne Domain funktioniert alles genauso, nur über die IP-Adresse und ohne Verschlüsselung. Das ist für ein internes Firmennetz in Ordnung.",
    contentsTitle: "Was auf dem USB-Stick ist",
    contentsRows: [
      ["install.sh", "Die Installation. Das ist das Einzige, was Sie starten müssen."],
      ["update.sh", "Aktualisiert Task Tracker auf eine neuere Version."],
      ["backup.sh", "Erstellt eine Sicherung von Datenbank und Dateien."],
      ["restore.sh", "Spielt eine Sicherung zurück."],
      ["uninstall.sh", "Entfernt Task Tracker wieder."],
      ["app/", "Der Programmcode der Anwendung."],
      ["images/", "Fertige Programmpakete für die Installation ohne Internet."],
      ["docs/", "Diese Anleitung."],
    ],
    step1Title: "Schritt 1 — USB-Stick anschließen",
    step1Body:
      "Stecken Sie den USB-Stick in den Server. Die meisten Linux-Systeme binden ihn automatisch unter /media/ oder /mnt/ ein. Falls nicht, kopieren Sie den Ordner einfach vorher über das Netzwerk auf den Server.",
    step1Cmd: `# Nachsehen, wo der Stick eingebunden wurde:
ls /media/*/  /mnt/

# In den Ordner auf dem Stick wechseln:
cd /media/usb/task-tracker-usb-v${VERSION}`,
    step2Title: "Schritt 2 — Installation starten",
    step2Body:
      "Ein einziger Befehl. Das sudo davor ist wichtig — die Installation braucht Administratorrechte.",
    step2Cmd: "sudo ./install.sh",
    step2After:
      "Der Installer prüft zuerst den Server und installiert Docker, falls es fehlt. Das sieht so aus:",
    step3Title: "Schritt 3 — Die drei Fragen",
    step3Body:
      "Mehr wird nicht gefragt. Alle Passwörter erzeugt der Installer selbst — Sie müssen sich nichts ausdenken.",
    step3Rows: [
      [
        "Domainname",
        "Ihre Domain, z. B. aufgaben.ihre-firma.de. Leer lassen, wenn Sie keine haben — dann wird der Server über seine IP-Adresse erreichbar.",
      ],
      [
        "E-Mail-Adresse",
        "Die Adresse des Administrators. Wird auch für das HTTPS-Zertifikat verwendet.",
      ],
      [
        "Sprache",
        "ar für Arabisch, de für Deutsch, en für Englisch. Jeder Benutzer kann seine Sprache später selbst ändern.",
      ],
    ],
    step4Title: "Schritt 4 — Warten",
    step4Body:
      "Jetzt baut der Server die Anwendung zusammen. Das dauert beim ersten Mal 10 bis 20 Minuten — bei einer Installation ohne Internet nur 3 bis 5 Minuten. Lassen Sie das Fenster offen.",
    step4Note:
      "Wenn hier eine Fehlermeldung erscheint, bricht der Installer ab und sagt Ihnen, was zu tun ist. Es wird nichts halb Fertiges zurückgelassen.",
    step5Title: "Schritt 5 — Fertig: Ihre Zugangsdaten",
    step5Body:
      "Am Ende zeigt der Installer die Adresse, den Benutzernamen und das erzeugte Passwort an:",
    step5Warn:
      "Schreiben Sie das Passwort auf. Es steht zusätzlich in der Datei /opt/task-tracker/ACCESS.txt, die nur der Administrator lesen kann.",
    step6Title: "Schritt 6 — Erste Anmeldung",
    step6Body:
      "Rufen Sie die angezeigte Adresse im Browser auf und melden Sie sich mit Benutzername und Passwort an.",
    step6Note:
      "Ändern Sie das Passwort direkt nach der ersten Anmeldung: oben rechts auf Ihr Profilbild klicken → Einstellungen.",
    afterTitle: "So sieht Task Tracker aus",
    offlineTitle: "Installation ohne Internet",
    offlineBody:
      "Wenn der Server keine Internetverbindung hat, verwenden Sie einen Offline-Stick. Darauf liegen alle Programmpakete bereits fertig im Ordner images/. Der Befehl lautet dann:",
    offlineCmd: "sudo ./install.sh --offline",
    offlineNote:
      "Die Installation dauert dann nur 3 bis 5 Minuten. Alles andere ist identisch. Ein HTTPS-Zertifikat kann ohne Internet allerdings nicht ausgestellt werden — im internen Netz ist das kein Problem.",
    opsTitle: "Sicherung, Wiederherstellung, Update",
    opsIntro:
      "Nach der Installation liegen alle Befehle in /opt/task-tracker. Wechseln Sie zuerst dorthin:",
    opsCd: "cd /opt/task-tracker",
    opsRows: [
      ["sudo ./backup.sh", "Sicherung jetzt erstellen"],
      ["sudo ./backup.sh --to /media/usb", "Sicherung auf einen USB-Stick schreiben"],
      ["sudo ./restore.sh", "Vorhandene Sicherungen auflisten"],
      ["sudo ./restore.sh --from latest --yes", "Die neueste Sicherung zurückspielen"],
      ["sudo ./update.sh --from /media/usb/…", "Auf eine neuere Version aktualisieren"],
      ["sudo ./update.sh --rollback", "Ein Update rückgängig machen"],
      ["sudo ./uninstall.sh", "Task Tracker entfernen, Daten behalten"],
    ],
    opsAuto:
      "Eine automatische Sicherung läuft jede Nacht um 03:30 Uhr. Die letzten 14 Sicherungen werden aufbewahrt, unter /var/backups/task-tracker.",
    opsWarn:
      "Wichtig: Eine Sicherung, die nur auf demselben Server liegt, hilft nicht, wenn der Server ausfällt. Kopieren Sie regelmäßig eine Sicherung auf einen USB-Stick oder einen anderen Rechner.",
    troubleTitle: "Wenn etwas nicht funktioniert",
    troubleRows: [
      [
        "Die Seite ist nicht erreichbar",
        "cd /opt/task-tracker && sudo docker compose ps — alle drei Zeilen sollten running zeigen. Protokoll ansehen: sudo docker compose logs -f app",
      ],
      [
        "Kein HTTPS-Zertifikat",
        "Die Domain muss auf diesen Server zeigen und die Ports 80 und 443 müssen von außen erreichbar sein. Prüfen mit: sudo docker compose logs caddy",
      ],
      [
        "Passwort vergessen",
        "Es steht in /opt/task-tracker/ACCESS.txt (nur als Administrator lesbar): sudo cat /opt/task-tracker/ACCESS.txt",
      ],
      [
        "Port 80 ist schon belegt",
        "Mit anderen Ports installieren: sudo ./install.sh --http-port 8080 --https-port 8443",
      ],
      [
        "Noch einmal von vorn",
        "sudo ./uninstall.sh --purge löscht alles (nach Rückfrage und mit angebotener Sicherung), danach sudo ./install.sh",
      ],
    ],
    supportTitle: "Unterstützung",
    supportBody:
      "Die Installation kann gefahrlos wiederholt werden: ein erneuter Aufruf von install.sh erkennt eine vorhandene Installation, behält alle Daten und setzt kein bestehendes Passwort zurück.",
  },

  ar: {
    dir: "rtl",
    lang: "ar",
    font: `"Segoe UI", "Tahoma", "Arial", sans-serif`,
    title: "متتبِّع المهام",
    subtitle: "دليل التثبيت",
    edition: `نسخة USB · الإصدار ${VERSION}`,
    coverNote:
      "يرشدك هذا الدليل خطوة بخطوة لتثبيت متتبِّع المهام على خادمك الخاص. لا تحتاج إلى خبرة مسبقة — برنامج التثبيت يتكفّل بكل شيء.",
    toc: "المحتويات",
    tocItems: [
      "ما الذي تحتاجه",
      "محتويات ذاكرة USB",
      "الخطوة ١ — توصيل ذاكرة USB",
      "الخطوة ٢ — بدء التثبيت",
      "الخطوة ٣ — الأسئلة الثلاثة",
      "الخطوة ٤ — الانتظار",
      "الخطوة ٥ — انتهى: بيانات الدخول",
      "الخطوة ٦ — أول تسجيل دخول",
      "التثبيت دون اتصال بالإنترنت",
      "النسخ الاحتياطي والاستعادة والتحديث",
      "إذا لم يعمل شيء ما",
    ],
    reqTitle: "ما الذي تحتاجه",
    reqIntro:
      "خادم بأحد أنظمة التشغيل التالية، مع صلاحيات مدير النظام (root أو sudo).",
    reqRows: [
      ["نظام التشغيل", "Ubuntu 22.04 أو Ubuntu 24.04 أو Debian 12"],
      ["الذاكرة", "٤ غيغابايت (والأكثر أفضل)"],
      ["القرص الصلب", "٢٠ غيغابايت متاحة"],
      ["المعالج", "نواتان، x86_64 أو ARM64"],
      ["الشبكة", "المنفذان 80 و 443 يجب أن يكونا متاحين"],
      ["الصلاحيات", "root أو مستخدم يملك صلاحية sudo"],
    ],
    reqNote:
      "يُثبَّت Docker تلقائيًا إن لم يكن موجودًا. لا حاجة لأي تحضير مسبق منك.",
    domainTitle: "اختياري: اسم نطاق",
    domainBody:
      "إذا كان لديك اسم نطاق (مثل tasks.your-company.com) يشير إلى هذا الخادم، فسيُعِدّ برنامج التثبيت شهادة HTTPS تلقائيًا — مجانًا ومع تجديد ذاتي. وبدون نطاق يعمل كل شيء بالطريقة نفسها، لكن عبر عنوان IP ودون تشفير، وهذا مقبول داخل شبكة الشركة الداخلية.",
    contentsTitle: "محتويات ذاكرة USB",
    contentsRows: [
      ["install.sh", "التثبيت. هذا هو الملف الوحيد الذي عليك تشغيله."],
      ["update.sh", "تحديث متتبِّع المهام إلى إصدار أحدث."],
      ["backup.sh", "إنشاء نسخة احتياطية من قاعدة البيانات والملفات."],
      ["restore.sh", "استعادة نسخة احتياطية."],
      ["uninstall.sh", "إزالة متتبِّع المهام."],
      ["app/", "الشيفرة البرمجية للتطبيق."],
      ["images/", "حِزَم جاهزة للتثبيت دون اتصال بالإنترنت."],
      ["docs/", "هذا الدليل."],
    ],
    step1Title: "الخطوة ١ — توصيل ذاكرة USB",
    step1Body:
      "أدخِل ذاكرة USB في الخادم. تقوم معظم أنظمة لينكس بتركيبها تلقائيًا ضمن ‎/media/‎ أو ‎/mnt/‎. وإن لم يحدث ذلك، فانسخ المجلد إلى الخادم عبر الشبكة أولًا.",
    // No trailing colons in these comments: the block is forced LTR for the
    // commands, and bidi would move a final ':' to the wrong end of the line.
    step1Cmd: `# لمعرفة مكان تركيب الذاكرة
ls /media/*/  /mnt/

# الانتقال إلى المجلد الموجود على الذاكرة
cd /media/usb/task-tracker-usb-v${VERSION}`,
    step2Title: "الخطوة ٢ — بدء التثبيت",
    step2Body:
      "أمر واحد فقط. كلمة sudo في البداية ضرورية، لأن التثبيت يحتاج إلى صلاحيات مدير النظام.",
    step2Cmd: "sudo ./install.sh",
    step2After:
      "يفحص البرنامج الخادم أولًا، ثم يثبّت Docker إن كان ناقصًا. يظهر ذلك هكذا:",
    step3Title: "الخطوة ٣ — الأسئلة الثلاثة",
    step3Body:
      "لن يُسأل أكثر من ذلك. كل كلمات المرور يولّدها البرنامج بنفسه — لست مضطرًا لابتكار أي منها.",
    step3Rows: [
      [
        "اسم النطاق",
        "نطاقك، مثل tasks.your-company.com. اتركه فارغًا إن لم يكن لديك نطاق، وعندها يصبح الخادم متاحًا عبر عنوان IP الخاص به.",
      ],
      [
        "البريد الإلكتروني",
        "بريد مدير النظام. يُستخدم أيضًا لإصدار شهادة HTTPS.",
      ],
      [
        "اللغة",
        "‏ar للعربية، de للألمانية، en للإنجليزية. ويستطيع كل مستخدم تغيير لغته لاحقًا بنفسه.",
      ],
    ],
    step4Title: "الخطوة ٤ — الانتظار",
    step4Body:
      "الآن يقوم الخادم ببناء التطبيق. يستغرق ذلك من ١٠ إلى ٢٠ دقيقة في المرة الأولى، ومن ٣ إلى ٥ دقائق فقط في حالة التثبيت دون إنترنت. اترك النافذة مفتوحة.",
    step4Note:
      "إذا ظهرت رسالة خطأ هنا، يتوقف البرنامج ويخبرك بما يجب فعله. ولا يترك خلفه تثبيتًا ناقصًا.",
    step5Title: "الخطوة ٥ — انتهى: بيانات الدخول",
    step5Body:
      "في النهاية يعرض البرنامج العنوان واسم المستخدم وكلمة المرور المولّدة:",
    step5Warn:
      "دوِّن كلمة المرور. وهي محفوظة أيضًا في الملف ‎/opt/task-tracker/ACCESS.txt‎ الذي لا يستطيع قراءته سوى مدير النظام.",
    step6Title: "الخطوة ٦ — أول تسجيل دخول",
    step6Body:
      "افتح العنوان المعروض في المتصفح، وسجّل الدخول باسم المستخدم وكلمة المرور.",
    step6Note:
      "غيّر كلمة المرور مباشرة بعد أول تسجيل دخول: اضغط على صورتك الشخصية في الأعلى ← الإعدادات.",
    afterTitle: "هكذا يبدو متتبِّع المهام",
    offlineTitle: "التثبيت دون اتصال بالإنترنت",
    offlineBody:
      "إذا كان الخادم غير متصل بالإنترنت، فاستخدم ذاكرة USB من النوع دون اتصال. جميع الحِزَم موجودة فيها جاهزة داخل مجلد ‎images/‎. عندئذٍ يكون الأمر:",
    offlineCmd: "sudo ./install.sh --offline",
    offlineNote:
      "عندها لا يستغرق التثبيت سوى ٣ إلى ٥ دقائق، وكل ما عدا ذلك مطابق. غير أنه لا يمكن إصدار شهادة HTTPS دون إنترنت — وهذا ليس مشكلة داخل الشبكة الداخلية.",
    opsTitle: "النسخ الاحتياطي والاستعادة والتحديث",
    opsIntro:
      "بعد التثبيت تكون كل الأوامر في ‎/opt/task-tracker‎. انتقل إلى هناك أولًا:",
    opsCd: "cd /opt/task-tracker",
    opsRows: [
      ["sudo ./backup.sh", "إنشاء نسخة احتياطية الآن"],
      ["sudo ./backup.sh --to /media/usb", "كتابة النسخة الاحتياطية على ذاكرة USB"],
      ["sudo ./restore.sh", "عرض النسخ الاحتياطية المتاحة"],
      ["sudo ./restore.sh --from latest --yes", "استعادة أحدث نسخة احتياطية"],
      ["sudo ./update.sh --from /media/usb/…", "التحديث إلى إصدار أحدث"],
      ["sudo ./update.sh --rollback", "التراجع عن التحديث"],
      ["sudo ./uninstall.sh", "إزالة التطبيق مع الإبقاء على البيانات"],
    ],
    opsAuto:
      "تُنفَّذ نسخة احتياطية تلقائية كل ليلة الساعة ٣:٣٠. ويُحتفظ بآخر ١٤ نسخة في ‎/var/backups/task-tracker‎.",
    opsWarn:
      "مهم: النسخة الاحتياطية الموجودة على الخادم نفسه لا تنفع إذا تعطّل الخادم. انسخ نسخة احتياطية بانتظام إلى ذاكرة USB أو جهاز آخر.",
    troubleTitle: "إذا لم يعمل شيء ما",
    troubleRows: [
      [
        "الصفحة غير متاحة",
        "cd /opt/task-tracker && sudo docker compose ps — يجب أن تظهر الأسطر الثلاثة بحالة running. لعرض السجل: sudo docker compose logs -f app",
      ],
      [
        "لا توجد شهادة HTTPS",
        "يجب أن يشير النطاق إلى هذا الخادم وأن يكون المنفذان 80 و 443 متاحين من الخارج. للتحقق: sudo docker compose logs caddy",
      ],
      [
        "نسيت كلمة المرور",
        "هي موجودة في ‎/opt/task-tracker/ACCESS.txt‎ (يقرأها مدير النظام فقط): sudo cat /opt/task-tracker/ACCESS.txt",
      ],
      [
        "المنفذ 80 مستخدَم بالفعل",
        "ثبِّت بمنافذ أخرى: sudo ./install.sh --http-port 8080 --https-port 8443",
      ],
      [
        "البدء من جديد",
        "الأمر sudo ./uninstall.sh --purge يحذف كل شيء (بعد تأكيد، مع عرض نسخة احتياطية أخيرة)، ثم sudo ./install.sh",
      ],
    ],
    supportTitle: "الدعم",
    supportBody:
      "يمكن تكرار التثبيت بأمان: تشغيل install.sh مرة أخرى يكتشف وجود تثبيت سابق، ويحافظ على كل البيانات، ولا يعيد تعيين كلمة مرور قائمة.",
  },
};

// --- Rendering helpers ----------------------------------------------------------
const term = (text) =>
  `<pre class="term" dir="ltr">${esc(text)}</pre>`;

const cmd = (text) => `<pre class="cmd" dir="ltr">${esc(text)}</pre>`;

const table = (rows, firstIsCode = false) => `
<table>
  <tbody>
    ${rows
      .map(
        ([a, b]) => `<tr>
      <th>${firstIsCode ? `<code dir="ltr">${esc(a)}</code>` : esc(a)}</th>
      <td>${esc(b)}</td>
    </tr>`
      )
      .join("\n")}
  </tbody>
</table>`;

const shot = (src, caption, cls = "") =>
  src
    ? `<figure class="${cls}"><img src="${src}" alt=""/>${
        caption ? `<figcaption>${esc(caption)}</figcaption>` : ""
      }</figure>`
    : "";

const note = (text, kind = "note") =>
  `<p class="${kind}">${esc(text)}</p>`;

function buildHtml(t, images) {
  const step = (n, title) =>
    `<h2><span class="num">${n}</span>${esc(title)}</h2>`;

  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<title>${esc(t.title)} — ${esc(t.subtitle)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: ${t.font};
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1e293b;
    margin: 0;
  }
  h1, h2, h3 { color: #0f172a; line-height: 1.3; }
  h2 {
    font-size: 15pt;
    margin: 26px 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #e2e8f0;
    break-after: avoid;
  }
  h3 { font-size: 12pt; margin: 18px 0 6px; break-after: avoid; }
  p { margin: 0 0 10px; }
  .num {
    display: inline-block;
    min-width: 26px; height: 26px;
    line-height: 26px;
    text-align: center;
    background: #0ea5e9; color: #fff;
    border-radius: 50%;
    font-size: 11pt;
    margin-inline-end: 10px;
  }

  /* --- cover ---------------------------------------------------------- */
  .cover {
    break-after: page;
    height: 245mm;
    display: flex; flex-direction: column; justify-content: center;
    text-align: center;
  }
  .cover .mark {
    font-size: 44pt; line-height: 1;
    margin-bottom: 18px;
  }
  .cover h1 { font-size: 30pt; margin: 0 0 6px; letter-spacing: -0.5px; }
  .cover .sub { font-size: 17pt; color: #0369a1; margin-bottom: 26px; }
  .cover .edition {
    display: inline-block;
    font-size: 10pt; color: #475569;
    border: 1px solid #cbd5e1; border-radius: 999px;
    padding: 5px 16px; margin-bottom: 30px;
  }
  .cover .note {
    max-width: 118mm; margin: 0 auto;
    font-size: 11pt; color: #334155;
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 16px 20px;
    text-align: ${t.dir === "rtl" ? "right" : "left"};
  }
  .cover .rule {
    width: 60mm; height: 3px; background: #0ea5e9;
    margin: 0 auto 26px; border-radius: 2px;
  }

  /* --- toc ------------------------------------------------------------ */
  .toc { break-after: page; }
  .toc ol { margin: 0; padding-inline-start: 22px; }
  .toc li { margin-bottom: 7px; color: #334155; }

  /* --- code ----------------------------------------------------------- */
  pre {
    font-family: "Cascadia Mono", "Consolas", "DejaVu Sans Mono", monospace;
    font-size: 8.6pt;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 12px 0;
    text-align: left;
    break-inside: avoid;
  }
  .cmd {
    background: #0f172a; color: #e2e8f0;
    font-size: 10pt;
    border-inline-start: 4px solid #0ea5e9;
  }
  .term {
    background: #0b1220; color: #cbd5e1;
    border: 1px solid #1e293b;
    font-size: 8pt;
  }
  code {
    font-family: "Cascadia Mono", "Consolas", "DejaVu Sans Mono", monospace;
    font-size: 9pt;
    background: #f1f5f9; border-radius: 4px; padding: 1px 5px;
    color: #0f172a;
  }

  /* --- tables --------------------------------------------------------- */
  table {
    width: 100%; border-collapse: collapse; margin: 12px 0 16px;
    break-inside: avoid;
  }
  th, td {
    border: 1px solid #e2e8f0;
    padding: 8px 11px;
    text-align: ${t.dir === "rtl" ? "right" : "left"};
    vertical-align: top;
    font-weight: normal;
  }
  th {
    background: #f8fafc;
    width: 34%;
    font-weight: 600;
    color: #0f172a;
  }

  /* --- callouts ------------------------------------------------------- */
  .note, .warn {
    border-radius: 8px; padding: 11px 14px; margin: 12px 0;
    font-size: 10pt; break-inside: avoid;
  }
  .note { background: #f0f9ff; border-inline-start: 4px solid #0ea5e9; }
  .warn { background: #fffbeb; border-inline-start: 4px solid #f59e0b; }

  /* --- figures -------------------------------------------------------- */
  figure { margin: 14px 0; break-inside: avoid; }
  figure img {
    width: 100%; height: auto;
    border: 1px solid #cbd5e1; border-radius: 8px;
    display: block;
  }
  figcaption {
    font-size: 8.5pt; color: #64748b; margin-top: 6px; text-align: center;
  }
  /* The app screenshots are full-page captures and can be several thousand
     pixels tall. Crop them to the top rather than letting one image eat a
     whole page. */
  .two-up { display: flex; gap: 10px; break-inside: avoid; }
  .two-up figure { flex: 1; margin: 14px 0; }
  .two-up img { max-height: 95mm; object-fit: cover; object-position: top center; }
  figure.crop img { max-height: 110mm; object-fit: cover; object-position: top center; }
  .page-break { break-before: page; }
</style>
</head>
<body>

<section class="cover">
  <div class="mark">✓</div>
  <h1>${esc(t.title)}</h1>
  <div class="sub">${esc(t.subtitle)}</div>
  <div class="rule"></div>
  <div><span class="edition">${esc(t.edition)}</span></div>
  <div class="note">${esc(t.coverNote)}</div>
</section>

<section class="toc">
  <h2>${esc(t.toc)}</h2>
  <ol>${t.tocItems.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>
</section>

<h2>${esc(t.reqTitle)}</h2>
<p>${esc(t.reqIntro)}</p>
${table(t.reqRows)}
${note(t.reqNote)}

<h3>${esc(t.domainTitle)}</h3>
<p>${esc(t.domainBody)}</p>

<h2>${esc(t.contentsTitle)}</h2>
${table(t.contentsRows, true)}

<div class="page-break"></div>

${step(1, t.step1Title)}
<p>${esc(t.step1Body)}</p>
${cmd(t.step1Cmd)}

${step(2, t.step2Title)}
<p>${esc(t.step2Body)}</p>
${cmd(t.step2Cmd)}
<p>${esc(t.step2After)}</p>
${term(logSlice("install-log.txt", "Checking the machine", "Configuration"))}

<div class="page-break"></div>

${step(3, t.step3Title)}
<p>${esc(t.step3Body)}</p>
${table(t.step3Rows)}

${step(4, t.step4Title)}
<p>${esc(t.step4Body)}</p>
${term(logSlice("install-log.txt", "Generating passwords", "Starting Task Tracker"))}
${note(t.step4Note)}

<div class="page-break"></div>

${step(5, t.step5Title)}
<p>${esc(t.step5Body)}</p>
${term(logSlice("install-log.txt", "Installation complete", "Everyday commands", 1))}
${note(t.step5Warn, "warn")}

${step(6, t.step6Title)}
<p>${esc(t.step6Body)}</p>
${shot(images.login, null)}
${note(t.step6Note)}

<div class="page-break"></div>

<h2>${esc(t.afterTitle)}</h2>
<div class="two-up">
  ${shot(images.dash, null)}
  ${shot(images.board, null)}
</div>

<h2>${esc(t.offlineTitle)}</h2>
<p>${esc(t.offlineBody)}</p>
${cmd(t.offlineCmd)}
${note(t.offlineNote)}

<div class="page-break"></div>

<h2>${esc(t.opsTitle)}</h2>
<p>${esc(t.opsIntro)}</p>
${cmd(t.opsCd)}
${table(t.opsRows, true)}
${note(t.opsAuto)}
${note(t.opsWarn, "warn")}

<h2>${esc(t.troubleTitle)}</h2>
${table(t.troubleRows)}

<h3>${esc(t.supportTitle)}</h3>
<p>${esc(t.supportBody)}</p>

</body>
</html>`;
}

// --- Build -----------------------------------------------------------------------
const OUT = {
  de: join(HERE, "INSTALL_DE.pdf"),
  ar: join(HERE, "INSTALL_AR.pdf"),
};

const footer = (label) => `
<div style="width:100%;font-size:7.5pt;color:#94a3b8;padding:0 16mm;
            font-family:Segoe UI,Arial,sans-serif;display:flex;
            justify-content:space-between;">
  <span>${label}</span>
  <span class="pageNumber"></span>/<span class="totalPages"></span>
</div>`;

async function main() {
  mkdirSync(ASSETS, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const lang of ["de", "ar"]) {
      const t = L[lang];
      const images =
        lang === "ar"
          ? { login: IMG.freshAr || IMG.loginAr, dash: IMG.dashAr, board: IMG.boardAr }
          : { login: IMG.freshDe || IMG.loginDe, dash: IMG.dashDe, board: IMG.boardDe };

      const html = buildHtml(t, images);
      // Keep the HTML next to the PDF so the source of a shipped guide is
      // always inspectable without re-running the build.
      writeFileSync(join(HERE, `install-${lang}.html`), html, "utf8");

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      await page.pdf({
        path: OUT[lang],
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footer(`${t.title} — ${t.subtitle} · v${VERSION}`),
        margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
      });
      await page.close();
      console.log(`  ✓ ${OUT[lang]}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
