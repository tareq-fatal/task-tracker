# Security-Audit Task-Tracker — Pre-Launch

**Datum:** 2026-07-29
**Stand:** `main` @ `6262183` (PRs #5–#39)
**Live:** https://tasks.coastshield.net
**Methode:** 5 parallele Review-Durchgänge mit unterschiedlichen Perspektiven (Multi-Tenant-Isolation, Injection, Auth/Session/SSO, Secrets/PII/Dependencies, Upload/Bot/Integrationen). Jeder Fund unten wurde anschließend von Hand am Code nachgeprüft; nicht verifizierte Vermutungen sind nicht aufgenommen.
**Fixes:** Branch `fix/security-audit-2026-07`

---

## Kurzfassung

| | Anzahl | Status |
|---|---|---|
| Kritisch | 6 | 5 gefixt, 1 offen (deploy-gekoppelt) |
| Wichtig | 8 | dokumentiert |
| Info | 7 | dokumentiert |

Die Codebase ist insgesamt **solider als bei einem Audit dieser Größe üblich**. Auth ist konservativ gebaut (opake DB-Sessions statt JWT — die ganze JWT-Angriffsklasse entfällt damit), Argon2 durchgängig ohne schwachen Fallback, keine einzige Raw-SQL-Stelle außer der bewusst gebauten BackendAdmin-Konsole, keine `eval`/`child_process`-Nutzung, saubere Sentry-Scrubbing-Konfiguration, non-root Container, keine Secrets in der Git-History.

Die kritischen Funde konzentrieren sich auf **drei Muster**:

1. **Global-unique Schlüssel und ungeprüfte Fremd-IDs in einem Multi-Tenant-Modell.** Der Code prüft `tenantId` an fast allen Stellen sehr diszipliniert — die Lücken sitzen dort, wo eine ID *nicht* das Primärobjekt der Anfrage ist, sondern eine Relation daran (`projectId`, `teamId`, `assignedToUserId`) oder ein externer Idempotenz-Schlüssel (`externalId`).
2. **Ein bequemer Default, der in Produktion durchschlägt** (Bootstrap-Passwörter).
3. **Uploads unter `public/`**, wo Next.js sie nach jedem Neustart an der Autorisierung vorbei statisch ausliefert.

**Ein wichtiger Hinweis zur Selbstprüfung:** `scripts/audit-tenant-scope.mjs` meldet „0 UNGUARDED" — auch *vor* den Fixes. Das Skript stuft jede `findUnique`/`update`/`delete`-Abfrage pauschal als „by-id query (post-fetch tenantId check pattern)" ein, **ohne zu prüfen, ob dieser Check existiert**, und deckt nur 6 Modelle ab. Beide kritischen Multi-Tenant-Funde lagen exakt in diesem blinden Fleck. Das Skript ist als Regressionsschutz derzeit wenig wert — siehe W-8.

---

## Deploy-Status

⚠️ **Die Fixes sind committet und gepusht, aber NICHT deployed.** Von dieser Maschine gibt es keinen Prod-Zugang: `gh secret list` zeigt, dass `VPS_SSH_KEY` im Repo nicht gesetzt ist, der Workflow „Deploy to VPS" kann also nicht laufen, und SSH auf die VPS existiert hier ebenfalls nicht. Die Verifikation in Prod steht damit aus und muss nach dem Deploy nachgeholt werden — die Schritte stehen bei jedem Fix unter „Verifikation in Prod".

---

# KRITISCH

## K-1 — Tenant-übergreifender Schreibzugriff über den Planner-Import ✅ GEFIXT

**Kategorie:** Cross-Tenant-Write
**Ort:** [src/actions/import.ts:111](src/actions/import.ts#L111), [:190](src/actions/import.ts#L190); [prisma/schema.prisma:271](prisma/schema.prisma#L271), [:414](prisma/schema.prisma#L414)

`Project.externalId` und `Task.externalId` waren **global** `@unique`. Der Import-Upsert traf nur auf diesen nackten Schlüssel:

```ts
await prisma.task.upsert({
  where: { externalId: tk.externalId },   // kein tenantId
  update: common,                          // title, description, status, priority, projectId, assignedToUserId …
```

Existierte die `externalId` bereits in einem **anderen** Tenant, ging Prisma in den `update`-Zweig und überschrieb dessen Zeile im Bestand. `tenantId` steht nur im `create`-Zweig, die Zeile bleibt also beim Opfer-Tenant — mit den Inhalten des Angreifers. Dasselbe für das Projekt (`update: { name: wb.planName }`). Anschließend hängen die neu importierten Tasks über `projectId: project.id` am **fremden** Projekt.

Dass die Zeilen 157–166 die Existenzprüfung sehr wohl tenant-skopiert machen (nur für die Zählung), zeigt: die Skopierung war beabsichtigt und ist im Upsert schlicht vergessen worden.

**Reproduktion**
1. Tenant B importiert Plan `plan-XYZ`; Tasks bekommen `externalId = task-abc123`.
2. Admin von Tenant A lädt unter `/admin/import` eine `.xlsx` hoch, deren Plan-ID-Zelle `plan-XYZ` und deren Task-Zeile `externalId = task-abc123` enthält, mit beliebigem Titel/Status.
3. Bs Projekt wird umbenannt, Bs Task überschrieben. Bs Nutzer sehen die geänderten Daten auf ihrem Board; kein Datensatz hat den Tenant gewechselt, es fällt also nirgends auf.

**Fix (umgesetzt):** `@@unique([tenantId, externalId])` auf beiden Modellen, Migration `20260729120000_tenant_scoped_external_id`, beide Upserts auf `tenantId_externalId` umgestellt. `onboarding.ts:51` (`findUnique` auf demselben Schlüssel) mitgezogen — dort nicht ausnutzbar, da der Schlüssel die User-ID enthält.

Die Migration-Richtung ist **strikt permissiver**: jede Zeile, die den globalen Unique erfüllte, erfüllt auch den zusammengesetzten. Sie kann auf Bestandsdaten nicht scheitern.

**Aufwand:** 2 h · **Verifikation in Prod:** Nach Deploy prüfen, dass `\d "Task"` die Indizes `Task_tenantId_externalId_key` zeigt und `Task_externalId_key` weg ist; einen Import mit einer bereits in einem anderen Tenant vergebenen `externalId` fahren — er muss einen *neuen* Task anlegen statt den fremden zu ändern.

---

## K-2 — Tasks lassen sich an fremde Projekte, Teams und Nutzer hängen ✅ GEFIXT

**Kategorie:** Cross-Tenant-Read + Cross-Tenant-Write
**Ort:** [src/actions/tasks.ts:414](src/actions/tasks.ts#L414) (create), [:509](src/actions/tasks.ts#L509) (update), `syncAssignees` [:137](src/actions/tasks.ts#L137)

`taskSchema` lässt `projectId`, `teamId`, `assignedToUserId` als reine `optionalId` durch, beide Actions schrieben sie ungeprüft nach Prisma. Direkt daneben macht `hierarchyFromForm` es für `parentId` **richtig** (`findFirst({ where: { id: parentId, tenantId } })`) — die drei anderen Relationen wurden dabei übersehen. `syncAssignees` legt zusätzlich `TaskAssignee`-Zeilen für jede per `assigneeIds` übergebene User-ID an, ebenfalls ohne Tenant-Filter.

Daraus folgen drei getrennte Isolationsbrüche:

- **Lesen:** `taskCardSelect` und die Task-Detailseite lösen `project: { select: { name } }` und `assignedTo: { select: { name, avatar } }` als verschachtelte Relation **ohne** Tenant-Prädikat auf. Der fremde Projektname und der fremde Nutzername samt Avatar werden auf dem Board des Angreifers gerendert.
- **Schreiben:** `notifyMany` → `notify` sucht den Empfänger über die nackte ID und legt eine `Notification` für den fremden Nutzer an — inklusive Web-Push, Telegram und E-Mail. Die Glocke des Opfers filtert nur nach `userId`, zeigt sie also an.
- **Zerstörend, verkettet:** Hängt der Task am fremden Projekt, löscht `deleteProjectAction` ihn über `task.updateMany({ where: { projectId, deletedAt: null } })` — **ohne `tenantId`** — mit weg, sobald der fremde Admin sein Projekt löscht.

**Reproduktion**
1. Als beliebiger Nutzer in Tenant A eine fremde `cuid` besorgen (Projekt-ID aus einem geteilten Screenshot, User-ID aus einem `/admin/users/<id>`-Link).
2. Eigenen Task anlegen, dann `updateTaskAction` mit `projectId=<Projekt aus Tenant B>`, `assignedToUserId=<User aus Tenant B>`, `assigneeIds=<User aus Tenant B>` posten.
3. `/tasks/<id>` laden — fremder Projektname und fremder Nutzername erscheinen. Der Nutzer in Tenant B bekommt gleichzeitig Benachrichtigung, Push und Telegram-Nachricht.

**Fix (umgesetzt):** Neue Helfer `scopedRelations()` und `scopedAssigneeIds()` in `tasks.ts`, die alle vier IDs gegen den Session-Tenant auflösen; eine fremde ID wird zu `null` bzw. fällt aus der Liste — genau wie `hierarchyFromForm` es mit einer fremden `parentId` schon tat. Die validierten Werte fließen auch in `syncAssignees` und in die Notification-Empfänger. Zusätzlich `tenantId` in den drei ungeskopten Task-Queries in `projects.ts` ergänzt.

**Aufwand:** 1,5 h · **Verifikation in Prod:** Task anlegen mit einer `projectId` aus einem fremden Tenant (per DevTools ins Formular) — das Feld muss leer bleiben, und in der DB muss `projectId IS NULL` stehen statt der fremden ID.

---

## K-3 — Öffentlich bekanntes SuperAdmin-Default-Passwort ✅ GEFIXT

**Kategorie:** Default-Credentials
**Ort:** [prisma/bootstrap.ts:40](prisma/bootstrap.ts#L40), [:44](prisma/bootstrap.ts#L44); [.env.example:12](.env.example#L12), [:16](.env.example#L16)

```ts
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin-2026!";
const DEMO_PASSWORD  = process.env.DEMO_PASSWORD  ?? "Demo-2026!";
```

Genau diese Literale stehen in `.env.example` im Repo. Fünf Umstände verschärfen das:

1. `bootstrap.ts` ist der **empfohlene Produktionspfad** — `seed.ts:42` verweist ausdrücklich darauf.
2. `seed.ts:43` hat eine `NODE_ENV === "production"`-Sperre. **`bootstrap.ts` hat keine.**
3. Es legt einen `SuperAdmin` an — die tenant-übergreifende Rolle.
4. Zeilen 145–146 legen zwei weitere `Admin`-Konten (`tarek`, `marine`) mit `DEMO_PASSWORD` an.
5. `mustChangePassword` wird nie gesetzt, ein Wechsel wird also nie erzwungen.

Ein Deploy, bei dem die beiden Variablen schlicht fehlen, ergibt `admin` / `Admin-2026!` mit SuperAdmin-Rechten.

**Reproduktion:** Deploy ohne `ADMIN_PASSWORD` im Env, `npm run bootstrap` laufen lassen, auf `/login` als `admin` / `Admin-2026!` anmelden.

**Fix (umgesetzt):** Beide Fallbacks entfernt — `requiredSecret()` bricht mit klarer Meldung ab, wenn die Variable fehlt oder kürzer als 12 Zeichen ist. `mustChangePassword: true` auf allen vom Bootstrap erzeugten Konten. `.env.example` auf `CHANGE-ME-…`-Platzhalter umgestellt.

> **Sofortmaßnahme für Tarek, unabhängig vom Deploy:** Bitte prüfen, ob in Prod aktuell ein Konto mit einem dieser Passwörter existiert (`admin`, `tarek`, `marine`). Falls ja: **sofort rotieren** — der Fix verhindert nur die künftige Neuanlage, er ändert kein bestehendes Passwort.

**Aufwand:** 45 min · **Verifikation in Prod:** Login mit `Admin-2026!` und `Demo-2026!` muss fehlschlagen. `npm run bootstrap` ohne gesetzte Env-Variablen muss abbrechen statt anzulegen.

---

## K-4 — Tenant-übergreifende SSO-Übernahme über Domain-Beanspruchung ✅ GEFIXT

**Kategorie:** Cross-Tenant-Authorization
**Ort:** [src/actions/sso.ts:52](src/actions/sso.ts#L52); [callback/route.ts:76](src/app/api/auth/[provider]/callback/route.ts#L76)

`saveTenantSsoAction` schrieb `ssoDomains` als beliebigen String — ohne Eigentumsnachweis und ohne globale Eindeutigkeit. Der Callback löste den Tenant dann per `tenants.find(...)` über ein `findMany()` **ohne `orderBy`** auf: bei zwei Anspruchstellern gewinnt, was Postgres zuerst liefert.

Ein Kunde, der `victim-corp.com` in seinen eigenen Tenant einträgt, fängt damit neue SSO-Anmeldungen dieser Domain ab: Der Mitarbeiter des Opfers wird im Tenant des Angreifers auto-provisioniert, sieht dessen Daten, und alles was er anlegt landet dort. Bestehende verknüpfte Identitäten sind nicht betroffen, was den Radius auf Erstanmeldungen begrenzt.

**Reproduktion**
1. Tenant B nutzt `ssoDomains = victim-corp.com` mit Google-SSO.
2. Admin von Tenant A trägt unter Einstellungen → SSO ebenfalls `victim-corp.com` ein, aktiviert Google, `autoProvision` an (Default).
3. `alice@victim-corp.com` meldet sich erstmals per Google an und landet in Tenant A.

**Fix (umgesetzt):** Domain-Ansprüche sind jetzt exklusiv — `saveTenantSsoAction` lehnt mit `DOMAIN_CLAIMED:<domain>` ab, wenn ein anderer Tenant die Domain bereits führt. Der Callback **fällt geschlossen aus** (`ambiguous_tenant`), wenn mehr als ein Tenant passt; das deckt Kollisionen ab, die eventuell schon in der DB stehen. Das Parsen liegt jetzt in einer gemeinsamen `parseDomains()` in `lib/sso.ts`, damit Anspruchsprüfung und Matching nicht auseinanderlaufen — der Vergleich ist eintragsgenau, `corp.com` beansprucht also nicht `evilcorp.com`.

**Aufwand:** 45 min · **Verifikation in Prod:** In zwei Tenants dieselbe Domain eintragen — der zweite Versuch muss abgelehnt werden. Vorher einmal per SQL prüfen, ob es bereits Kollisionen gibt: `SELECT slug, "ssoDomains" FROM "Tenant" WHERE "ssoDomains" IS NOT NULL;`

---

## K-5 — Stored XSS über SVG-Logos und dateinamensbasierte Endungen ✅ TEILWEISE GEFIXT

**Kategorie:** Stored XSS
**Ort:** [src/actions/branding.ts:16](src/actions/branding.ts#L16); [src/actions/tasks.ts:882](src/actions/tasks.ts#L882)

Der Mechanismus dahinter ist der Kern von K-6 und wurde am Next.js-Quelltext nachgeprüft: In Produktion liest Next `public/` **einmal beim Serverstart** vollständig ein (`filesystem.js:154`) und prüft diese Menge **vor** den App-Routen (`itemsToCheck`, `filesystem.js:352`). Das Upload-Verzeichnis ist ein Docker-Volume und überlebt Neustarts.

Das Team kannte die SVG-Gefahr und hat einen Route-Handler gebaut, der das Logo mit `Content-Security-Policy: sandbox; default-src 'none'` ausliefert. Dieser Header greift aber nur, solange der *Handler* läuft. Nach dem nächsten Container-Neustart gewinnt der statische Handler: `Content-Type: image/svg+xml`, keine CSP — und ein `<script>` im SVG läuft auf der App-Origin. `X-Content-Type-Options: nosniff` von Caddy hilft hier nicht, weil der Typ ja korrekt SVG ist.

Zweiter Weg: `const ext = path.extname(file.name)` nahm die Endung aus dem **Nutzer-Dateinamen**, völlig entkoppelt von der MIME-Allowlist. Eine Datei mit `Content-Type: image/png` und Namen `payload.html` landete als `<hex>.html` auf der Platte.

**Fix (umgesetzt):** SVG aus `LOGO_TYPES` und aus dem `accept`-Attribut entfernt. Anhang-Endungen kommen jetzt aus der neuen `MIME_EXTENSION`-Tabelle, abgeleitet aus dem geprüften MIME; ein Typ ohne Eintrag wird mit `BAD_TYPE` abgelehnt. Regressionstest stellt sicher, dass die Tabelle nie `.html`, `.svg`, `.js` o. ä. liefert.

> **Nicht behoben:** Bereits hochgeladene SVG-Logos liegen weiter im Volume und bleiben nach einem Neustart ausführbar. **Bitte auf der VPS prüfen und löschen:** `docker compose exec task-tracker find /app/public/uploads -name '*.svg'`

**Aufwand:** 1 h · **Verifikation in Prod:** SVG-Upload im Branding muss mit `BAD_TYPE` abgelehnt werden.

---

## K-6 — Uploads unter `public/` werden nach Neustart ohne Auth ausgeliefert ⚠️ OFFEN

**Kategorie:** Broken Access Control (tenant-übergreifend)
**Ort:** [src/actions/tasks.ts:884](src/actions/tasks.ts#L884), [:940](src/actions/tasks.ts#L940); [src/actions/branding.ts:65](src/actions/branding.ts#L65); [src/lib/export-runner.ts:97](src/lib/export-runner.ts#L97); Volume in [docker-compose.yml:73](docker-compose.yml#L73), [infra/docker-compose.task-tracker.yml:42](infra/docker-compose.task-tracker.yml#L42)

Gleicher Mechanismus wie K-5, aber mit Autorisierungswirkung: Alle Laufzeit-Uploads liegen unter `public/uploads/`. Nach jedem Neustart werden sie statisch ausgeliefert — **ohne Session-Prüfung**, an den sorgfältig gebauten `/download/*`-Routen vorbei, die Tenant *und* Task-Sichtbarkeit korrekt prüfen.

Am schwersten wiegen die Exporte: `diskName = ${job.id}.${ext}`, und die Job-ID wird dem API-Aufrufer zurückgegeben. `/uploads/exports/<jobId>.xlsx` ist damit ein **unauthentifizierter Download eines vollständigen Tenant-Reports** — auch für einen längst deaktivierten Nutzer, der die ID einmal gesehen hat. Logo-Pfade sind über den Tenant-Slug vollständig erratbar. Anhänge sind durch den 96-Bit-Zufallsnamen praktisch geschützt, aber eben nur durch Unkenntnis des Namens, nicht durch eine Prüfung.

**Warum ich das nicht gefixt habe:** Der richtige Fix ist, das Upload-Wurzelverzeichnis aus `public/` herauszuziehen (`/app/var/uploads`). Das koppelt eine Code-Änderung an eine **Volume-Umstellung und eine Dateimigration auf der VPS**. Würde ich nur den Code ändern, suchte die Anwendung ab dem nächsten Deploy in `var/uploads`, während die Bestandsdateien in `public/uploads` liegen — **sämtliche vorhandenen Anhänge, Sprachnotizen und Logos wären sofort tot**. Ohne VPS-Zugang kann ich die Migration nicht mitfahren, und ein halber Umzug ist schlimmer als der Ist-Zustand. Deshalb dokumentiert statt ausgeführt.

**Runbook für den Fix (zusammen mit Tarek, ~4 h):**
1. `src/lib/upload-paths.ts` mit `UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "var", "uploads")`.
2. Schreibpfade umstellen: `tasks.ts:884`, `tasks.ts:940`, `branding.ts:65`, `export-runner.ts:12`.
3. Lesepfade umstellen: `download/attachment`, `download/voice`, `download/export`, `uploads/tenants/[slug]/[file]` — jeweils mit `path.resolve(...).startsWith(UPLOAD_ROOT)` als Containment-Prüfung.
4. Volume in beiden Compose-Dateien auf `/app/var/uploads` umhängen.
5. **Im selben Wartungsfenster** auf der VPS: `docker compose exec task-tracker cp -a /app/public/uploads/. /app/var/uploads/`, danach erst neu starten.
6. Nach erfolgreicher Prüfung `public/uploads` leeren.

**Sofortige Teilentschärfung ohne Code-Änderung:** In Caddy `/uploads/*` blocken, sodass nur die `/download/*`-Routen durchkommen. Das nimmt sofort die unauthentifizierte Auslieferung heraus — Achtung, es deaktiviert damit auch die legitime Logo-Auslieferung über `/uploads/tenants/...`, die dann über den Route-Handler laufen muss.

---

# WICHTIG

Nur dokumentiert — Entscheidung liegt bei Tarek.

## W-1 — SSO-Kontoübernahme über unverifizierte Provider-E-Mail (nOAuth)
[callback/route.ts:89](src/app/api/auth/[provider]/callback/route.ts#L89), [src/lib/sso.ts:118](src/lib/sso.ts#L118)

Findet der Callback keine verknüpfte Identität, sucht er ein lokales Konto **allein über die E-Mail** und verknüpft es. Es gibt **keine `email_verified`-Prüfung für irgendeinen Provider**, `decodeJwt` dekodiert das `id_token` nur (keine Signatur-, `iss`-, `aud`-Prüfung), und `AZURE_AD_TENANT_ID` steht laut `docs/SSO-SETUP.md` per Default auf `common` — jedes Entra-Verzeichnis darf sich also anmelden. Das Entra-Attribut `mail` ist bei Cloud-Only-Nutzern frei setzbar: das ist das publizierte nOAuth-Muster.

Ein Angreifer legt im eigenen Entra-Verzeichnis einen Nutzer mit `mail = ceo@victimcorp.com` an und bekommt eine Session als dieser CEO. **Relevanz hängt daran, ob SSO überhaupt für einen Tenant aktiv ist** — bitte prüfen: `SELECT * FROM "TenantAuthProvider" WHERE enabled = true;`. Falls ja, gehört das in die Kritisch-Klasse und sollte vor Launch gefixt werden.

**Fix:** `emailVerified` pro Provider mitführen und erzwingen (Google/Apple: `email_verified` im `id_token`; GitHub: `/user/emails` mit `verified`; Azure: `mail` nicht vertrauen, `tid` gegen eine Allowlist prüfen). `id_token` echt validieren (JWKS, Signatur, `iss`, `aud`, `exp`, `nonce`) statt nur zu dekodieren. `AZURE_AD_TENANT_ID=common` als Konfigurationsfehler behandeln. **Aufwand:** 1–1,5 Tage (JWKS ist der Löwenanteil).

## W-2 — `getSprintsView` ohne Rollenprüfung
[src/actions/sprints.ts:42](src/actions/sprints.ts#L42)

Die Action ist nur mit `requireTenant()` geschützt, während **jede** Mutation in derselben Datei `requireAdminTenant()` nutzt — der Helper steht direkt darüber. Die Admin-Prüfung liegt ausschließlich in `sprints/page.tsx:15`, was ein direkter Server-Action-Aufruf nie durchläuft. Zurück kommen alle Projektnamen des Tenants plus die Titel aller Sprint- und bis zu 200 Backlog-Tasks — ohne `taskVisibility`-Skopierung. Das ist derselbe Fehlertyp, den Commit `32003bc` behoben hat, an einer übersehenen Stelle. Intra-Tenant, deshalb „wichtig" statt „kritisch".

**Fix:** `requireTenant()` → `requireAdminTenant()`. **Aufwand:** 15 min.

## W-3 — Acht Admin-Konfigurations-Reader ohne Rollenprüfung
`planner-sync.ts:28`, `webhooks.ts:61`/`:178`, `automation.ts:21`, `templates.ts:32`, `custom-fields.ts:42`, `workflow-columns.ts:24`, `sso.ts:27`

Gleiches Muster wie W-2: Mutationen sind admin-gated, die Lese-Actions nicht. Ein normaler Nutzer kann direkt aufrufen und bekommt: alle Webhook-Ziel-URLs (enthalten oft ein Slack/Teams-Token im Pfad) samt maskierter Secrets und Delivery-Fehlertexten, alle Projektnamen plus Planner-`planId`s, Automatisierungsregeln, Templates, Custom-Field-Definitionen und die SSO-Domainliste.

**Fix:** Jeweils den in der Datei bereits vorhandenen Admin-Helper als Guard verwenden. Ausnahme `getFieldDefs` — wird auch vom normalen Task-Formular gebraucht, dort `requireTenant()` belassen. **Aufwand:** 45 min für alle acht.

## W-4 — Full-URL-SSRF über ausgehende Webhooks
[src/actions/webhooks.ts:52](src/actions/webhooks.ts#L52), [src/lib/webhooks-dispatch.ts:39](src/lib/webhooks-dispatch.ts#L39)

`validUrl()` prüft **nur** das Protokoll. Host, Port und Pfad sind frei wählbar, es gibt keine IP-Allowlist, keinen DNS-Rebinding-Schutz und kein `redirect: "manual"` (fetch folgt bis zu 20 Weiterleitungen, jede spätere Host-Filterung wäre also per 302 umgehbar). Nicht blind: bei Nicht-2xx werden 500 Byte des Antwortkörpers gespeichert und von `sendTestAction` an den Aufrufer zurückgegeben — ein sauberes Orakel für internen Port-/Host-Scan, inklusive `169.254.169.254`. Erreichbar für jeden **Tenant**-Admin, also kundenkontrolliert.

**Fix:** Egress-Guard mit DNS-Auflösung und Blockliste für private/link-local Bereiche, `redirect: "manual"`, und den Remote-Body nicht mehr an den Client zurückgeben. **Aufwand:** 2 h.

## W-5 — Planner-Sync: beliebige `planId` auf einem org-weiten Graph-Token
[src/actions/planner-sync.ts:62](src/actions/planner-sync.ts#L62), [src/lib/graph.ts:53](src/lib/graph.ts#L53)

Die Integration nutzt ein einzelnes Anwendungs-Token (Client-Credentials, `Tasks.ReadWrite.All`) — also Zugriff auf **jeden** Planner-Plan der M365-Organisation. `linkPlannerPlanAction` prüft den lokalen `projectId` gegen den Tenant, die `planId` aber **überhaupt nicht**. Ein Tenant-Admin kann damit jeden Plan der Organisation abziehen (`pull`) oder verändern (`push`/`two-way`). Verschärfend: `planId` wird roh in den Graph-Pfad interpoliert, ein Wert wie `../../users?$select=mail&x=` normalisiert sich zu einer beliebigen Graph-Abfrage mit diesem Token.

**Fix:** `planId`-Zeichensatz prüfen und `encodeURIComponent` nutzen; Plan-Berechtigung über eine explizite Allowlist absichern oder auf delegiertes OAuth umstellen, damit Graph selbst die Rechte des Aufrufers durchsetzt. **Aufwand:** 4 h (Allowlist) bzw. 2 Tage (delegiertes OAuth).

## W-6 — `xlsx@0.18.5`: Prototype Pollution über hochgeladene Dateien
[src/lib/bulk-import.ts:209](src/lib/bulk-import.ts#L209), [src/lib/planner-import.ts:133](src/lib/planner-import.ts#L133)

Anders als das übliche `npm audit`-Rauschen ist das hier nachweislich erreichbar: beide Pfade rufen `read(buffer)` direkt auf einem hochgeladenen Puffer. Prototype Pollution beim Parsen einer bösartigen Mappe verseucht `Object.prototype` für den **gesamten** Serverprozess, betrifft also alle Folge-Requests. Besonderheit der Lieferkette: `npm audit` meldet „no fix available", weil SheetJS sich aus der npm-Registry zurückgezogen hat — die gepatchte Linie kommt nur von `cdn.sheetjs.com`.

**Fix:** `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` oder Wechsel auf `exceljs`. **Aufwand:** Mittel (Abhängigkeitswechsel plus Regressionstest beider Importpfade).

## W-7 — `next@14.2.21` mit offenen kritischen Advisories
`package.json`

Direkte Runtime-Abhängigkeit, `npm audit` stuft sie als **critical** ein. Reichweite geprüft statt übernommen: die prominente Middleware-Umgehung **CVE-2025-29927 greift hier nicht**, es gibt keine `middleware.ts`. Relevant bleiben „Unauthenticated disclosure of internal Server Function endpoints" und die Cache-Poisoning-Einträge — bei einer Server-Action-first-App wie dieser durchaus einschlägig.

**Fix:** Auf den aktuellen `14.2.x`-Patch heben (Patch-Level innerhalb derselben Minor, keine Migration nötig), danach Build und E2E durchlaufen lassen. **Aufwand:** klein.

## W-8 — `audit-tenant-scope.mjs` erzeugt falsche Sicherheit
[scripts/audit-tenant-scope.mjs](scripts/audit-tenant-scope.mjs)

Das Skript meldete „✗ UNGUARDED: 0" auch zu dem Zeitpunkt, als K-1 und K-2 offen im Code standen. Ursache: Es stuft jede `findUnique`/`update`/`delete`-Abfrage pauschal als „by-id query (post-fetch tenantId check pattern)" ein, **ohne zu prüfen, ob der Check existiert**, und kennt nur 6 Modelle. Als Regressionsschutz für genau die Fehlerklasse, für die es gebaut wurde, taugt es damit nicht — und es ist gefährlicher als kein Skript, weil ein grünes Ergebnis Prüfaufwand ersetzt.

**Fix:** Entweder die By-ID-Zweige tatsächlich auf einen nachfolgenden Tenant-Vergleich prüfen und die Modellliste aus `schema.prisma` generieren, oder die Ausgabe ehrlich machen („53 nicht geprüft"). **Aufwand:** 3 h.

---

# INFO

| # | Fund | Ort | Empfehlung |
|---|---|---|---|
| I-1 | Passwortwechsel ohne Eingabe des alten Passworts, und andere Sessions werden nicht beendet. Wer kurz Zugriff auf einen angemeldeten Browser hat, sperrt den Eigentümer dauerhaft aus; ein gestohlenes 30-Tage-Cookie überlebt den Wechsel. Admin-Pfade machen es richtig, nur Self-Service nicht. | [settings.ts:15](src/actions/settings.ts#L15) | `currentPassword` verlangen (außer bei `mustChangePassword`), danach alle anderen Sessions löschen. ~2 h |
| I-2 | Kein Rate-Limiting auf Login, SSO oder Telegram-Webhook. `createRateLimiter` existiert, wird aber nur an genau einer Stelle genutzt (Tenant-Löschung). Verstärkt durch Mindestpasswortlänge 6 und 32-Bit-Temp-Passwörter. | [auth.ts:12](src/actions/auth.ts#L12), [rate-limit.ts:13](src/lib/rate-limit.ts#L13) | Persistenten Zähler auf (IP, Username); Mindestlänge auf 12. Der In-Memory-Limiter ist pro Prozess und hinter mehreren Containern wirkungslos. ~1 Tag |
| I-3 | Keine Content-Security-Policy. Caddy setzt HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` — CSP fehlt an beiden Ebenen. | [infra/Caddyfile.task-tracker:21](infra/Caddyfile.task-tracker#L21) | Zunächst `Content-Security-Policy-Report-Only`, dann auf Nonce-basiert verschärfen. |
| I-4 | `/api-docs` lädt Swagger-UI von `unpkg.com` **ohne** Subresource-Integrity und ohne CSP — fremder Code auf der App-Origin. | [api-docs/page.tsx:8](src/app/api-docs/page.tsx#L8) | Selbst hosten (`npm i swagger-ui-dist` → `public/vendor/`), sonst `integrity` setzen. Klein. |
| I-5 | `GET /t/{slug}` ändert dauerhaft den aktiven Tenant eines BackendAdmins (1 Jahr Cookie-Laufzeit). `SameSite=Lax` wird bei Top-Level-GET mitgesendet, ein Link genügt. Zusätzlich ist `tt_tenant` nicht `httpOnly`. | [t/[slug]/route.ts:12](src/app/t/[slug]/route.ts#L12) | Auf POST-Server-Action umstellen (Origin-Prüfung greift dann), `Sec-Fetch-Site` prüfen, Cookie auf `httpOnly` + `secure`. ~2 h |
| I-6 | Nutzername-Enumeration über Login-Laufzeit: Argon2 läuft nur, wenn der Nutzer existiert. Die Fehlermeldung ist korrekt einheitlich — die Laufzeit nicht. Zusammen mit I-2 lässt sich die Nutzerliste abziehen. | [auth.ts:25](src/actions/auth.ts#L25) | Gegen einen festen Dummy-Hash verifizieren, wenn kein Nutzer gefunden wurde. 30 min |
| I-7 | `seed.ts` gibt Admin- und Demo-Passwort im Klartext auf stdout aus; über `workflow_dispatch` landen sie im GitHub-Actions-Log, wo sie **nicht** maskiert sind. Prod ist durch die `NODE_ENV`-Sperre geschützt, Staging nicht. | [seed.ts:525](prisma/seed.ts#L525) | Nur Nutzernamen ausgeben. Trivial. |

Weitere geprüfte, aber bewusst **nicht** als Fund gewertete Punkte: CSV-Formel-Injection im Bulk-Import-Fehlerreport (nur admin-erreichbar, Ersteller und Herunterladender sind meist dieselbe Person), `sql-guard` Read-Mode als Keyword-Regex (nur BackendAdmin, der ohnehin schreiben darf), Nicht-konstantzeitiger Vergleich der Cron-Secrets (volle Entropie über TLS, praktisch nicht ausnutzbar), Push-Endpoint-Übernahme (Endpoints werden von keiner API preisgegeben), Apple-SSO-Callback funktioniert wegen `SameSite=Lax` bei `form_post` gar nicht (Bug mit Sicherheitsbezug — den naheliegenden Fix `SameSite=None` bitte **nicht** wählen, das bringt Login-CSRF zurück).

---

# Als sicher bestätigt

Nicht nur „nichts gefunden", sondern aktiv nachgelesen und für korrekt befunden:

**Injection.** Im gesamten Repo gibt es **keine einzige** Raw-SQL-Stelle außer der bewussten BackendAdmin-Konsole (`db-admin.ts`, `requireSuper()`-gated, mit Stacked-Statement-Prüfung und Audit-Log). Null Vorkommen von `$queryRaw`, `Prisma.raw` oder `$executeRawUnsafe` in `src/lib`, `src/app`, `prisma/`, `scripts/`, `worker/`. Kein dynamisches `ORDER BY`. Kein `child_process`, kein `eval`, kein `new Function`. Kein Path-Traversal: alle 7 Dateisystem-Lesezugriffe setzen auf serverseitig erzeugte Namen, der einzige request-gesteuerte Pfad ist per Regex auf `^logo\.(png|svg|jpg|webp)$` eingeschränkt.

**XSS.** Genau drei `dangerouslySetInnerHTML`, alle geprüft und harmlos (statischer Theme-Bootstrap, `JSON.stringify` einer Konstante, sowie `brandStyle()`, dessen Eingaben eine `^#?([0-9a-f]{6})$`-Prüfung passieren). Kein `innerHTML`, kein `document.write`. Keine `href`/`src` aus Nutzerdaten. Auf diesem Branch existiert **kein** Rich-Text-Editor — falls `feat/rich-text-editor` gemergt wird, braucht der sanitisierte HTML-Pfad eine eigene Prüfung.

**Session-Design.** Bewusst konservativ: opake 256-Bit-Zufallstokens (`randomBytes(32)`) in einer `Session`-Tabelle, **kein JWT, keine signierten Cookies**. Damit entfällt die gesamte `alg:none`/Algorithm-Confusion/Decode-statt-Verify-Klasse. `getCurrentUser()` geht bei jedem Zugriff an die DB, prüft `expiresAt` serverseitig und lehnt deaktivierte Nutzer ab. `role`, `tenantId` und `tenantSlug` werden bei jedem Request frisch aus der DB gelesen — im Cookie steht nichts Fälschbares. Cookie-Flags korrekt (`httpOnly`, `sameSite=lax`, `secure` in Produktion; `NODE_ENV=production` ist in beiden Compose-Dateien explizit gesetzt).

**Passwörter und Tokens.** Argon2 über `@node-rs/argon2` an allen sechs Erzeugungsstellen, kein stiller bcrypt/SHA-Fallback. `Math.random` wird **nirgends** sicherheitsrelevant verwendet (die zwei Treffer sind eine Test-Fixture und ein React-Key); jedes Sicherheitstoken nutzt `crypto.randomBytes`. Es existieren keine Passwort-Reset-/Magic-Link-Flows, die falsch sein könnten — Wiederherstellung läuft ausschließlich über Admins und beendet dabei korrekt die Sessions des Ziels.

**Tenant-Auflösung.** `getActiveTenant` beachtet das `tt_tenant`-Cookie **nur** für `isSuperAdmin`; jede andere Rolle ist hart an `user.tenantId` aus der DB gebunden. `/t/[slug]` und `switchTenantAction` prüfen `isSuperAdmin` serverseitig.

**Telegram-Bot — keine Funde.** Der eingehende Webhook prüft `X-Telegram-Bot-Api-Secret-Token` und **fällt geschlossen aus**, wenn das Secret fehlt. Der Verknüpfungstoken ist 128 Bit CSPRNG, läuft nach 30 Tagen ab und wird beim Einlösen genullt (echt einmalig). Der Bot-Token liegt in einem `"server-only"`-Modul und wird nie geloggt. Ausgehender Text wird per `esc()` HTML-escaped. Kein Bot-Kommando erreicht fremde Tenants.

**Web-Push — keine Funde.** VAPID-Private-Key server-only, nur der öffentliche trägt `NEXT_PUBLIC_`. Beide `/api/push`-Verben und `/api/push/test` verlangen eine Session; `/api/push/test` sendet ausschließlich an die eigenen Subscriptions.

**Cron- und interne Endpunkte.** Alle vier prüfen `SYNC_SECRET` und liefern `503` wenn es fehlt — ein nicht gesetztes Secret bedeutet „aus", nicht „offen".

**Secrets.** Kein einziges echtes Secret im getrackten Baum, auch nicht in `dist/`. `git log --all` zeigt: nur `.example`-Dateien waren je getrackt, es wurde **keine** Rotation wegen History nötig. `secrets/*.txt` liegen nur auf der Platte und sind korrekt gitignored. Jede `NEXT_PUBLIC_`-Variable ist echte öffentliche Konfiguration.

**Sentry.** `sendDefaultPii: false` in allen drei Runtimes, **keine** Session-Replay-Integration (also keine Formularaufzeichnung), `sentry-scrub.ts` läuft als `beforeSend` und `beforeSendTransaction`, entfernt Cookies hart und redigiert Header/Daten rekursiv gegen ein Secret-Muster. Source-Maps werden nach dem Upload gelöscht.

**Logging.** 34 `console.*`-Aufrufe insgesamt; keiner protokolliert Passwörter, Hashes, Session-Tokens oder API-Keys. Einzige Ausnahme ist I-7.

**Deployment.** Container läuft als non-root (`USER nextjs`), keine Secrets als Build-ARGs, keine `.env` im Image, `.dockerignore` deckt `.env*`, `secrets`, `*.pem`, `*.key` ab. In `infra/docker-compose.task-tracker.yml` werden **gar keine Ports** veröffentlicht — Caddy erreicht die App über das interne Netz, Postgres hat keinen `ports:`-Eintrag. Das ist die richtige Aufstellung.

**Kein `passwordHash` verlässt den Server.** Jedes Vorkommen ist entweder ein Schreibvorgang oder der Vergleich in `verifyPassword`; `getCurrentUser` mappt eine explizite Feld-Whitelist.

---

## Empfohlene Reihenfolge

**Vor dem Kunden-Launch:**
1. Branch `fix/security-audit-2026-07` deployen (K-1 bis K-5) und die Prod-Verifikationen abarbeiten.
2. Bestehende Passwörter von `admin`, `tarek`, `marine` rotieren, falls sie noch auf den Default stehen (K-3).
3. Prüfen, ob SSO überhaupt aktiv ist. Falls ja: W-1 vor Launch fixen.
4. K-6 im Wartungsfenster fahren, oder als Sofortmaßnahme `/uploads/*` in Caddy blocken.
5. W-2 und W-3 mitnehmen — zusammen unter einer Stunde.

**Kurz nach Launch:** W-4 bis W-7, dann I-1 bis I-3.

---

*Erstellt mit Claude Code. Alle hier aufgeführten Funde wurden am Quelltext verifiziert; die Next.js-Static-Serving-Behauptung hinter K-5/K-6 wurde direkt in `node_modules/next/dist/server/lib/router-utils/filesystem.js` nachgelesen.*
