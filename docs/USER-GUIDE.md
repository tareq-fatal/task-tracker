# User Guide · Benutzerhandbuch · دليل المستخدم

This guide is written three times, once per supported language — jump to
yours: [Deutsch](#deutsch) · [English](#english) · [العربية](#العربية).
Switch the app's language anytime via the globe icon in the top bar or
**Settings → Language**.

This guide covers what a regular **User** can do. If you're an Admin or
BackendAdmin, also read [ADMIN-GUIDE.md](ADMIN-GUIDE.md).

---

## Deutsch

### Anmelden

Öffne die App-URL, melde dich mit Benutzername und Passwort an. Beim ersten
Login läuft eine kurze **Willkommens-Tour** (überspringbar, später über
**Einstellungen** neu startbar).

### Ansichten

- **Meine Tasks** (Dashboard) — deine zugewiesenen und erstellten Tasks auf
  einen Blick, mit Kennzahlen-Karten.
- **Board** — Kanban-Board mit Spalten (Todo/In Arbeit/Erledigt oder
  projekteigene Spalten); Tasks per Drag & Drop verschieben.
- **Liste** — sortierbare Tabelle aller sichtbaren Tasks; Mehrfachauswahl für
  Massenaktionen (Status ändern, löschen), Spalten anklickbar sortierbar.
- **Kalender** — Kalender-, Gantt- und Timeline-Tab für Termine und Verläufe.
- **Roadmap** (falls für dich sichtbar) — Gantt-artige Zeitachse nach
  Epic/Projekt, mit Zoom-Stufen (3M/6M/1J/3J).

### Mit Tasks arbeiten

- **Erstellen**: Titel, Beschreibung, Status, Priorität, Fälligkeitsdatum,
  Zuweisung, Projekt. Tasks haben einen **Typ** (Epic/Story/Task/Subtask,
  Bug ist ein eigenständiger Typ) und können hierarchisch verschachtelt sein.
- **Mehrfach-Zuweisung**: eine Task hat eine:n Hauptverantwortliche:n plus
  optional weitere Mitwirkende — alle sind auf der Karte sichtbar.
- **Fortschritt**: manuell per Schieberegler, oder automatisch aus den
  **Unteraufgaben** (Checkliste) berechnet, sobald welche existieren.
- **Zeiterfassung**: geschätzte vs. tatsächliche Stunden, Start/Stopp-Timer
  mit sofortiger Anzeige (kein Warten auf den Server).
- **Verknüpfungen**: Abhängig-von / Blockiert / Verwandt-mit / Unteraufgabe-von
  — eine blockierte Task zeigt "wartet auf N", das automatisch verschwindet,
  sobald die Blocker erledigt sind.
- **Kommentare**: Diskussion pro Task, mit Lesebestätigungen im
  Telegram-Stil — ✓ (gesendet) wird zu ✓✓, sobald alle anderen Beobachter den
  Kommentar gelesen haben.
- **Anhänge**: Bilder, PDF, Office-Dateien, ZIP bis 10 MB.
- **Eigene Felder**: falls dein Admin welche angelegt hat, erscheinen sie im
  Task-Formular (Text/Zahl/Auswahl/Datum/Checkbox).
- **Wiederkehrende Tasks**: falls eine Regel gesetzt ist, erzeugt das System
  automatisch die nächste Instanz nach Erledigung.

### Projekte, Teams, Sprints

- **Projekte** sind farbcodiert und haben ein eigenes Board; nur Admins legen
  neue Projekte an. Bist du **Mitglied** eines Projekts, siehst du alle
  Tasks darin — nicht nur die dir zugewiesenen.
- **Teams** gruppieren Nutzer projektübergreifend, mit eigener Statistik.
- **Sprints**: falls dein Projekt Sprints nutzt, gibt es ein Scrum-Board mit
  Story Points und einer aktiven-Sprint-Kopfzeile.

### Filter & gespeicherte Ansichten

Die Filterleiste (Projekt, Team, Zuständige, Status, Priorität, Zeitraum,
Suche) ist auf mehreren Seiten verfügbar, kombinierbar und über die URL
teilbar. Falls du Zugriff auf **Fokus**-Ansichten hast, kannst du eigene
Filterkombinationen als **gespeicherte Ansicht** sichern.

### Benachrichtigungen

Die Glocke oben zeigt neue Ereignisse nahezu in Echtzeit (zugewiesen, Status
geändert, Kommentar, Erwähnung, bald fällig, überfällig, Blocker gelöst,
wiederkehrend). Unter **Einstellungen** kannst du (falls freigeschaltet) pro
Ereignistyp Kanäle (In-App/Push/E-Mail/Nativ), Ruhezeiten und eine
Tages-Zusammenfassung konfigurieren.

### Einstellungen

Design (Hell/Dunkel/System), Passwort ändern, Sprache wechseln. Weitere
Optionen (Benachrichtigungen, SSO, Planner-Sync, mobiler App-Download) sind
Admin-Einstellungen und erscheinen nur für Admins.

### Mobile App

Auf dem Desktop findest du unter Einstellungen (falls Admin) einen
Android-APK-Download-Link. Auf dem Handy/Tablet installierst du die App
stattdessen als **PWA** ("Zum Startbildschirm hinzufügen") direkt aus dem
Browser — siehe die Installations-Eingabeaufforderung beim ersten Besuch.

---

## English

### Signing in

Open the app URL and sign in with your username and password. On first
login you'll see a short **welcome tour** (skippable, restartable later from
**Settings**).

### Views

- **My Tasks** (Dashboard) — your assigned and created tasks at a glance,
  with KPI cards.
- **Board** — Kanban board with columns (Todo/In Progress/Done, or a
  project's custom columns); drag & drop to move tasks.
- **List** — sortable table of every task you can see; multi-select for bulk
  actions (change status, delete), sortable columns.
- **Calendar** — a tabbed Calendar / Gantt / Timeline view.
- **Roadmap** (if visible to you) — a Gantt-style timeline by Epic/Project,
  with zoom presets (3M/6M/1Y/3Y).

### Working with tasks

- **Create**: title, description, status, priority, due date, assignee,
  project. Tasks have a **type** (Epic/Story/Task/Subtask, with Bug as a
  separate type) and can be nested hierarchically.
- **Multi-assignee**: a task has one primary assignee plus optional
  co-assignees, all shown on the card.
- **Progress**: set manually with a slider, or auto-derived from
  **subtasks** (a checklist) once any exist.
- **Time tracking**: estimated vs. actual hours, a start/stop timer that
  updates instantly (no waiting on the server).
- **Links**: Depends-on / Blocks / Related-to / Subtask-of — a blocked task
  shows "waiting on N", which clears automatically once the blockers are done.
- **Comments**: a per-task discussion thread with Telegram-style read
  receipts — ✓ (sent) becomes ✓✓ once every other watcher has read it.
- **Attachments**: images, PDF, Office files, zip, up to 10 MB.
- **Custom fields**: if your admin has defined any, they appear on the task
  form (text/number/select/date/checkbox).
- **Recurring tasks**: if a recurrence rule is set, the system automatically
  spawns the next instance once the current one is completed.

### Projects, teams, sprints

- **Projects** are colour-coded and have their own board; only Admins can
  create new projects. If you're a **member** of a project, you see every
  task in it, not just the ones assigned to you.
- **Teams** group users across projects, with their own stats.
- **Sprints**: if your project uses sprints, there's a scrum board with story
  points and an active-sprint header.

### Filters & saved views

The filter bar (project, team, assignee, status, priority, date range,
search) appears on several pages, is combinable, and is shareable via the
URL. If you have access to **Focus** views, you can save a filter
combination as a personal **saved view**.

### Notifications

The bell icon shows new events near-instantly (assigned, status change,
comment, mention, due-soon, overdue, blocker resolved, recurring). Under
**Settings** (where enabled) you can configure channels per event type
(in-app/push/email/native), quiet hours, and a daily digest.

### Settings

Theme (Light/Dark/System), change password, switch language. Other options
(notifications, SSO, Planner sync, mobile app download) are admin-level and
only appear for Admins.

### Mobile app

On desktop, Admins see an Android APK download link under Settings. On phone
or tablet, install the app as a **PWA** ("Add to Home Screen") directly from
the browser — you'll see an install prompt on your first visit.

---

## العربية

### تسجيل الدخول

افتح رابط التطبيق وسجّل الدخول باسم المستخدم وكلمة المرور. عند أول تسجيل
دخول ستظهر لك **جولة ترحيبية** قصيرة (يمكن تخطّيها، وإعادة تشغيلها لاحقًا من
**الإعدادات**).

### طرق العرض

- **مهامي** (لوحة التحكم) — المهام المُسندة إليك والتي أنشأتها في نظرة
  واحدة، مع بطاقات مؤشرات الأداء.
- **اللوحة** — لوحة كانبان بأعمدة (قيد الانتظار/قيد التنفيذ/مكتملة، أو
  أعمدة مخصّصة للمشروع)؛ اسحب وأفلت لنقل المهام.
- **قائمة** — جدول قابل للفرز لكل المهام التي يمكنك رؤيتها؛ تحديد متعدد
  لإجراءات جماعية (تغيير الحالة، الحذف)، أعمدة قابلة للفرز.
- **التقويم** — عرض بعلامات تبويب للتقويم / مخطط جانت / الخط الزمني.
- **خارطة الطريق** (إن كانت ظاهرة لك) — خط زمني بأسلوب جانت حسب
  الملحمة/المشروع، بمستويات تكبير (3 أشهر/6 أشهر/سنة/3 سنوات).

### العمل مع المهام

- **الإنشاء**: العنوان، الوصف، الحالة، الأولوية، تاريخ الاستحقاق، المُسند
  إليه، المشروع. للمهام **نوع** (ملحمة/قصة/مهمة/مهمة فرعية، والخطأ Bug نوع
  مستقل)، ويمكن تداخلها هرميًا.
- **إسناد متعدد**: للمهمة مُسند رئيسي واحد ("الرأس الرئيسي") بالإضافة إلى
  مُسنَدين إضافيين اختياريين، وكلهم ظاهرون على البطاقة.
- **التقدّم**: يُضبط يدويًا بشريط تمرير، أو يُحسب تلقائيًا من **المهام
  الفرعية** (قائمة تدقيق) عند وجودها.
- **تتبّع الوقت**: الساعات المقدَّرة مقابل الفعلية، ومؤقّت بدء/إيقاف يظهر
  فورًا دون انتظار استجابة الخادم.
- **الروابط**: يعتمد على / يحجب / متعلق بـ / مهمة فرعية من — تُظهر المهمة
  المحجوبة "بانتظار N"، ويختفي هذا تلقائيًا بمجرد إنجاز المهام الحاجبة.
- **التعليقات**: نقاش لكل مهمة مع إيصالات قراءة على طريقة تيليجرام — ✓
  (أُرسل) تتحول إلى ✓✓ عندما يقرأها كل المتابعين الآخرين.
- **المرفقات**: صور، PDF، ملفات أوفيس، ملفات مضغوطة، حتى 10 ميغابايت.
- **حقول مخصّصة**: إن أنشأ المسؤول أي حقول، تظهر في نموذج المهمة (نص/رقم/
  اختيار/تاريخ/خانة اختيار).
- **المهام المتكررة**: إذا كانت هناك قاعدة تكرار، ينشئ النظام تلقائيًا
  النسخة التالية بعد إنجاز الحالية.

### المشاريع والفرق والسبرنتات

- **المشاريع** مرمّزة بالألوان ولها لوحتها الخاصة؛ يمكن للمسؤولين فقط إنشاء
  مشاريع جديدة. إن كنت **عضوًا** في مشروع، ترى كل مهامه، وليس فقط المُسندة
  إليك.
- **الفرق** تجمع المستخدمين عبر المشاريع، ولها إحصاءاتها الخاصة.
- **السبرنتات**: إن استخدم مشروعك السبرنتات، توجد لوحة سكرَم بنقاط قصة
  وترويسة للسبرنت النشط.

### الفلاتر والعروض المحفوظة

شريط الفلاتر (المشروع، الفريق، المُسند إليه، الحالة، الأولوية، النطاق
الزمني، البحث) متاح في عدة صفحات، قابل للدمج، وقابل للمشاركة عبر الرابط. إن
كان لديك وصول إلى عروض **تركيز**، يمكنك حفظ تركيبة فلاتر كـ**عرض محفوظ**
خاص بك.

### الإشعارات

يعرض رمز الجرس الأحداث الجديدة شبه فوريًا (إسناد، تغيير حالة، تعليق، إشارة،
اقتراب الاستحقاق، تأخّر، حل عائق، تكرار). ضمن **الإعدادات** (حيثما كان
مفعّلًا) يمكنك ضبط القنوات لكل نوع حدث (داخل التطبيق/دفع/بريد إلكتروني/
تطبيق أصلي)، وساعات الهدوء، وملخصًا يوميًا.

### الإعدادات

المظهر (فاتح/داكن/حسب النظام)، تغيير كلمة المرور، تبديل اللغة. الخيارات
الأخرى (الإشعارات، تسجيل الدخول الموحد، مزامنة Planner، تحميل التطبيق
للجوال) خاصة بالمسؤولين ولا تظهر إلا لهم.

### تطبيق الجوال

على سطح المكتب، يرى المسؤولون رابط تحميل ملف APK لأندرويد ضمن الإعدادات.
على الهاتف أو الجهاز اللوحي، ثبّت التطبيق كتطبيق **PWA** ("إضافة إلى الشاشة
الرئيسية") مباشرة من المتصفح — ستظهر لك رسالة تثبيت عند أول زيارة.
