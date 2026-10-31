// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI 3.1 description of the Task-Tracker HTTP surface.
//
// SINGLE SOURCE OF TRUTH. This module is served verbatim at GET /api/openapi.json
// and rendered by the Swagger-UI page at /api-docs. A committed snapshot lives at
// <repo>/openapi.json (regenerate with `npm run openapi:gen`).
//
// Scope — what this documents:
//   The real HTTP endpoints exposed by Next.js Route Handlers (app/**/route.ts):
//   OAuth/SSO, cron/sync webhooks, Web-Push subscription, attachment download,
//   tenant switch and logout.
//
// Scope — what this intentionally does NOT document:
//   Almost every mutation in the product runs through Next.js **Server Actions**
//   (src/actions/*.ts), not a REST API. Server Actions are invoked by an opaque,
//   per-deployment action id over an internal RPC protocol and are not a stable,
//   client-callable HTTP contract — so they are out of scope for OpenAPI. The
//   validation schemas those actions use (src/lib/validation.ts) are still
//   mirrored below under components.schemas as the canonical domain models.
//
// Schema provenance: the request/domain schemas below are DERIVED BY HAND from the
// Zod schemas in src/lib/validation.ts and the enums in src/lib/enums.ts. Keep the
// two in sync — a Zod change (a new max length, a new enum member) should be
// reflected here. Constraints (min/max/pattern/enum/default) match 1:1.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ROLES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_TYPES,
  TASK_LINK_TYPES,
  LOCALES,
} from "./enums";
import { SSO_PROVIDERS } from "./sso";
import { MAX_UPLOAD_BYTES, ALLOWED_MIME } from "./validation";
import { SITE_URL, instanceUrl } from "./instance-url";

/** JSON value — the served document is plain JSON, so we keep the type loose. */
type Json = Record<string, unknown>;

const VERSION = "3.1.0";

// ── Trilingual introduction (DE / EN / AR) ──────────────────────────────────
// Rendered as Markdown by Swagger-UI. Arabic is the product's primary locale
// (RTL); German and English follow.
const DESCRIPTION = `
# Task-Tracker API

> **DE** · **EN** · **العربية** — a trilingual introduction follows.

---

## 🇩🇪 Deutsch

Die **Task-Tracker-API** ist die HTTP-Schnittstelle der mandantenfähigen
Aufgabenverwaltung. Dokumentiert sind die tatsächlichen HTTP-Endpunkte
(Next.js *Route Handler*): **OAuth/SSO-Anmeldung**, **Cron-/Sync-Webhooks**,
**Web-Push-Abonnements**, **Datei-Download**, **Mandantenwechsel** und **Logout**.

Die meisten schreibenden Operationen der Anwendung laufen über **Next.js Server
Actions** und sind bewusst *nicht* Teil dieser REST-Dokumentation — sie besitzen
keinen stabilen, extern aufrufbaren HTTP-Vertrag. Die zugehörigen
Validierungsschemata sind unter \`components.schemas\` als Datenmodelle abgebildet.

**Authentifizierung.** Benutzer-Sitzungen laufen über ein **httpOnly-Session-Cookie**
(\`tt_session\`, 30 Tage, serverseitig in der Datenbank hinterlegt). Cron-Endpunkte
sind über den Header \`x-sync-secret\` (gemeinsames Geheimnis) abgesichert. **JWT**
kommt ausschließlich im OAuth-\`id_token\` der Identity-Provider vor und wird
serverseitig verifiziert — die API akzeptiert **kein** clientseitig übergebenes
Bearer-JWT.

## 🇬🇧 English

The **Task-Tracker API** is the HTTP surface of the multi-tenant task-management
app. What is documented here are the real HTTP endpoints (Next.js *Route
Handlers*): **OAuth/SSO sign-in**, **cron/sync webhooks**, **Web-Push
subscriptions**, **file download**, **tenant switching** and **logout**.

Most write operations run through **Next.js Server Actions** and are deliberately
*out of scope* for this REST reference — they have no stable, client-callable HTTP
contract. The validation schemas those actions use are mirrored under
\`components.schemas\` as the domain models.

**Authentication.** User sessions use an **httpOnly session cookie** (\`tt_session\`,
30 days, backed by a database row). Cron endpoints are guarded by a shared-secret
header (\`x-sync-secret\`). **JWT** appears *only* inside the OAuth \`id_token\`
returned by identity providers and is verified server-side — the API does **not**
accept a client-supplied bearer JWT.

## 🇸🇦 العربية

**واجهة برمجة تطبيقات متعقّب المهام** هي الواجهة عبر HTTP لتطبيق إدارة المهام
متعدّد المستأجرين. المُوثَّق هنا هو النقاط الطرفية الفعلية عبر HTTP (معالِجات
المسارات في Next.js): **تسجيل الدخول عبر OAuth/SSO**، و**خطافات المزامنة
والمهام المجدولة (cron)**، و**اشتراكات الإشعارات الفورية (Web-Push)**، و**تنزيل
الملفات**، و**تبديل المستأجر**، و**تسجيل الخروج**.

تعمل معظم عمليات الكتابة في التطبيق عبر **إجراءات الخادم (Server Actions)** في
Next.js، وهي خارج نطاق هذا المرجع عن قصد لأنها لا تملك عقد HTTP مستقرًّا قابلًا
للاستدعاء من العميل. ومع ذلك، فإن مخطّطات التحقّق المستخدَمة في تلك الإجراءات
مُدرَجة ضمن \`components.schemas\` كنماذج بيانات.

**المصادقة.** تعتمد جلسات المستخدم على **كوكي جلسة من نوع httpOnly** (\`tt_session\`،
مدّته 30 يومًا، مدعوم بسجلّ في قاعدة البيانات). أمّا نقاط cron فمحميّة بترويسة
سرّ مشترك (\`x-sync-secret\`). يظهر **JWT** حصريًّا داخل \`id_token\` الخاص بـ OAuth
القادم من مزوّدي الهوية ويُتحقَّق منه في الخادم — والواجهة **لا** تقبل رمز JWT
من نوع bearer مُرسَلًا من العميل.

---

## Rate limits

The application layer does **not** currently enforce request rate limiting; there
is no per-IP or per-token quota, and endpoints do not emit \`RateLimit-*\` headers
or \`429\` responses. In production the service runs behind a **Caddy reverse
proxy** (see \`next.config\`), which is the recommended place to apply coarse
network-level limits. Practical bounds that *do* exist today:

| Guard | Where | Limit |
| --- | --- | --- |
| Server-action body size | \`next.config\` \`serverActions.bodySizeLimit\` | **6 MB** per request |
| Attachment upload size | \`MAX_UPLOAD_BYTES\` | **${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB** per file |
| OAuth \`state\` lifetime | \`tt_sso_state\` cookie \`maxAge\` | **10 minutes** |
| Session lifetime | \`tt_session\` cookie / DB row | **30 days** |

If you add rate limiting, document the resulting \`429\` + \`Retry-After\` behaviour
here.
`.trim();

// ── Reusable enum schemas (mirror src/lib/enums.ts) ─────────────────────────
const enumSchema = (values: readonly string[], description: string): Json => ({
  type: "string",
  enum: [...values],
  description,
});

const Error: Json = {
  type: "object",
  description: "Uniform error envelope returned by the JSON endpoints.",
  properties: {
    error: { type: "string", example: "unauthorized" },
  },
  required: ["error"],
};

// ── Domain schemas derived from src/lib/validation.ts (Zod) ──────────────────
const Login: Json = {
  type: "object",
  description: "Credentials for password login (`loginSchema`).",
  required: ["username", "password"],
  properties: {
    username: { type: "string", minLength: 1, example: "layla" },
    password: { type: "string", minLength: 1, format: "password", example: "s3cret-pass" },
  },
};

const Task: Json = {
  type: "object",
  description:
    "Task create/update payload (`taskSchema`). Duration fields accept shorthands " +
    '("4h", "1d", "90m") that are parsed to hours server-side.',
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200, example: "Ship OpenAPI docs" },
    description: { type: "string", maxLength: 5000, default: "", example: "Generate the 3.1 spec and serve Swagger-UI." },
    status: { $ref: "#/components/schemas/TaskStatus", default: "Todo" },
    priority: { $ref: "#/components/schemas/TaskPriority", default: "Medium" },
    tags: {
      type: "array",
      items: { type: "string", maxLength: 24 },
      maxItems: 12,
      description:
        "Free tags, lowercase and without spaces. A comma-separated string is accepted too.",
      example: ["live-feedback", "qs"],
    },
    assignedToUserId: { type: "string", nullable: true, example: "clv0userid" },
    projectId: { type: "string", nullable: true, example: "clv0projid" },
    teamId: { type: "string", nullable: true, example: null },
    dueDate: { type: "string", format: "date", nullable: true, example: "2026-07-31" },
    estimatedHours: { type: "string", nullable: true, description: 'Shorthand like "4h" / "2d".', example: "1d" },
    spentHours: { type: "string", nullable: true, description: 'Shorthand like "90m".', example: "2h" },
  },
};

const Subtask: Json = {
  type: "object",
  description: "Subtask create payload (`subtaskSchema`).",
  required: ["title"],
  properties: { title: { type: "string", minLength: 1, maxLength: 200, example: "Write examples" } },
};

const Progress: Json = {
  type: "object",
  description: "Progress update (`progressSchema`).",
  required: ["progress"],
  properties: { progress: { type: "integer", minimum: 0, maximum: 100, example: 60 } },
};

const Project: Json = {
  type: "object",
  description: "Project create/update payload (`projectSchema`).",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120, example: "Harbour Upgrade" },
    description: { type: "string", maxLength: 2000, default: "", example: "Quay renovation programme." },
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#6366f1", example: "#0ea5e9" },
  },
};

const Team: Json = {
  type: "object",
  description: "Team create/update payload (`teamSchema`).",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120, example: "Platform" },
    description: { type: "string", maxLength: 2000, default: "", example: "Owns the core app." },
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#4f46e5", example: "#4f46e5" },
  },
};

const User: Json = {
  type: "object",
  description:
    "User create/update payload (`userSchema`). `email` and `password` may be empty " +
    "strings: empty email = no email, empty password = a temporary one is generated.",
  required: ["name", "username"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120, example: "Ahmed Ali" },
    username: {
      type: "string",
      minLength: 3,
      maxLength: 40,
      pattern: "^[a-zA-Z0-9_.-]+$",
      example: "ahmed.ali",
    },
    email: {
      oneOf: [{ type: "string", enum: [""] }, { type: "string", format: "email" }],
      default: "",
      example: "ahmed.ali@example.com",
    },
    password: {
      oneOf: [{ type: "string", enum: [""] }, { type: "string", minLength: 6 }],
      default: "",
      format: "password",
      example: "",
    },
    role: { $ref: "#/components/schemas/Role", default: "User" },
  },
};

const Comment: Json = {
  type: "object",
  description: "Task comment (`commentSchema`).",
  required: ["content"],
  properties: { content: { type: "string", minLength: 1, maxLength: 4000, example: "Looks good — merging." } },
};

const Settings: Json = {
  type: "object",
  description: "Account settings (`settingsSchema`). `newPassword`, when present, must be ≥ 6 chars.",
  required: ["locale"],
  properties: {
    locale: { $ref: "#/components/schemas/Locale" },
    newPassword: { type: "string", minLength: 6, nullable: true, format: "password", example: "brand-new-pw" },
  },
};

const PushSubscription: Json = {
  type: "object",
  description:
    "W3C Push API subscription forwarded from the browser. Shape matches " +
    "`PushSubscription.toJSON()`; the route reads `endpoint` and `keys.{p256dh,auth}`.",
  required: ["endpoint", "keys"],
  properties: {
    endpoint: {
      type: "string",
      format: "uri",
      example: "https://fcm.googleapis.com/fcm/send/abc123",
    },
    expirationTime: { type: "integer", nullable: true, example: null },
    keys: {
      type: "object",
      required: ["p256dh", "auth"],
      properties: {
        p256dh: { type: "string", example: "BENc7...mocth" },
        auth: { type: "string", example: "tBHIt...9s7A" },
      },
    },
  },
};

const PushUnsubscribe: Json = {
  type: "object",
  description: "Endpoint identifying the subscription to remove.",
  required: ["endpoint"],
  properties: {
    endpoint: { type: "string", format: "uri", example: "https://fcm.googleapis.com/fcm/send/abc123" },
  },
};

const CronResult: Json = {
  type: "object",
  description: "Result envelope from a cron/sync run. Extra keys depend on the job.",
  properties: {
    ok: { type: "boolean", example: true },
    dueSoon: { type: "integer", description: "notifications job — reminders sent for soon-due tasks." },
    overdue: { type: "integer", description: "notifications job — reminders sent for overdue tasks." },
    created: { type: "integer", description: "recurring job — task instances created." },
    ran: { type: "integer", description: "planner sync job — number of tenant syncs executed." },
  },
  required: ["ok"],
};

// ── Security schemes ─────────────────────────────────────────────────────────
const securitySchemes: Json = {
  sessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "tt_session",
    description:
      "Primary end-user authentication. An opaque, server-generated session token " +
      "stored as an httpOnly cookie and backed by a `Session` row (30-day expiry). " +
      "Set by password login (Server Action) or the OAuth callback; cleared by " +
      "`GET /logout`. Not a JWT — the token carries no claims.",
  },
  syncSecret: {
    type: "apiKey",
    in: "header",
    name: "x-sync-secret",
    description:
      "Shared-secret guard for machine-to-machine cron/sync endpoints. The value must " +
      "equal the server's `SYNC_SECRET` env var. When `SYNC_SECRET` is unset the " +
      "endpoints return `503`.",
  },
  mcpToken: {
    type: "http",
    scheme: "bearer",
    description:
      "Per-user machine token for the MCP endpoint (`tt_mcp_…`), sent as " +
      "`Authorization: Bearer`. Minted with `npm run mcp:token -- mint --user <username>`; " +
      "only its SHA-256 hash is stored, so the value is shown exactly once. The token " +
      "binds ONE user and ONE tenant — every call runs with that user's role inside that " +
      "mandant and cannot widen either. Carries a `read` or `read,write` scope, and is " +
      "refused once revoked, expired, or when its user is deactivated.",
  },
  oauth2: {
    type: "oauth2",
    description:
      "SSO sign-in via an identity provider (Microsoft/Azure-AD, Google, GitHub, " +
      "Apple). The browser is redirected through the provider; on return the server " +
      "verifies the provider's `id_token` (a JWT) and issues its own `tt_session` " +
      "cookie. This is a redirect flow driven by `/api/auth/{provider}/start` and " +
      "`/api/auth/{provider}/callback`, not a token the client sends to this API.",
    flows: {
      authorizationCode: {
        authorizationUrl: "/api/auth/azure-ad/start",
        tokenUrl: "/api/auth/azure-ad/callback",
        scopes: {},
      },
    },
  },
};

// ── Path items ───────────────────────────────────────────────────────────────
const providerParam: Json = {
  name: "provider",
  in: "path",
  required: true,
  description: "SSO identity provider.",
  schema: { $ref: "#/components/schemas/SsoProvider" },
};

const redirect302 = (description: string, location: string): Json => ({
  description,
  headers: {
    Location: { schema: { type: "string" }, example: location },
    "Set-Cookie": {
      schema: { type: "string" },
      description: "Session / state cookie side-effects where applicable.",
    },
  },
});

const cronOperation = (summary: string, description: string, exampleResult: Json): Json => ({
  summary,
  description,
  security: [{ syncSecret: [] }],
  tags: ["Cron & sync"],
  responses: {
    "200": {
      description: "Job ran.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CronResult" },
          example: exampleResult,
        },
      },
    },
    "401": {
      description: "Missing or wrong `x-sync-secret`.",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "unauthorized" } } },
    },
    "503": {
      description: "`SYNC_SECRET` is not configured on the server.",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "disabled (no SYNC_SECRET)" } } },
    },
  },
});

const paths: Json = {
  "/api/auth/{provider}/start": {
    get: {
      summary: "Begin OAuth sign-in",
      description:
        "Kicks off the OAuth 2.0 authorization-code flow: generates a CSRF `state`, " +
        "stores it in the `tt_sso_state` cookie (10-min TTL) and redirects the browser " +
        "to the provider's authorize URL. If the provider is unknown or unconfigured, " +
        "redirects to `/login?sso=unavailable` instead.",
      tags: ["Authentication"],
      parameters: [providerParam],
      security: [],
      responses: {
        "302": redirect302("Redirect to the provider's authorization endpoint.", "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?..."),
      },
    },
  },
  "/api/auth/{provider}/callback": {
    get: {
      summary: "OAuth callback (query mode)",
      description:
        "Provider redirect target for `response_type=code` (Azure-AD, Google, GitHub). " +
        "Validates `state` against the `tt_sso_state` cookie, exchanges the code, resolves " +
        "the user (link existing identity, route by email domain to a tenant, or " +
        "auto-provision when enabled), then sets the `tt_session` cookie and redirects to " +
        "`/`. On any failure redirects to `/login?sso={reason}`.",
      tags: ["Authentication"],
      parameters: [
        providerParam,
        { name: "code", in: "query", required: true, schema: { type: "string" }, description: "Authorization code from the provider." },
        { name: "state", in: "query", required: true, schema: { type: "string" }, description: "Must match the `tt_sso_state` cookie." },
      ],
      security: [],
      responses: {
        "302": {
          description:
            "Success → redirect to `/` with a fresh `tt_session` cookie. Failure → " +
            "redirect to `/login?sso={reason}` where reason ∈ {unavailable, state, exchange, " +
            "profile, no_tenant, disabled, no_account}.",
          headers: {
            Location: { schema: { type: "string" }, example: "/" },
            "Set-Cookie": { schema: { type: "string" }, example: "tt_session=…; HttpOnly; Path=/; SameSite=Lax" },
          },
        },
      },
    },
    post: {
      summary: "OAuth callback (form_post mode)",
      description:
        "Provider redirect target for `response_mode=form_post` (Apple). Same logic as the " +
        "GET callback but reads `code`/`state` from the posted form body.",
      tags: ["Authentication"],
      parameters: [providerParam],
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              required: ["code", "state"],
              properties: { code: { type: "string" }, state: { type: "string" } },
            },
          },
        },
      },
      responses: {
        "302": redirect302("Redirect to `/` (success) or `/login?sso={reason}` (failure).", "/"),
      },
    },
  },
  "/api/cron/notifications": {
    get: cronOperation(
      "Run due-reminder notifications",
      "Sends due-soon and overdue reminders. Idempotent to run repeatedly; typically " +
        "scheduled once daily (`0 7 * * *`). Accepts GET and POST identically.",
      { ok: true, dueSoon: 3, overdue: 1 }
    ),
    post: cronOperation(
      "Run due-reminder notifications",
      "Sends due-soon and overdue reminders. Idempotent to run repeatedly; typically " +
        "scheduled once daily (`0 7 * * *`). Accepts GET and POST identically.",
      { ok: true, dueSoon: 3, overdue: 1 }
    ),
  },
  "/api/cron/recurring": {
    get: cronOperation(
      "Materialize recurring tasks",
      "Creates the next instances of any recurring tasks that are due. Typically scheduled " +
        "every few hours (`0 */6 * * *`). Accepts GET and POST identically.",
      { ok: true, created: 2 }
    ),
    post: cronOperation(
      "Materialize recurring tasks",
      "Creates the next instances of any recurring tasks that are due. Typically scheduled " +
        "every few hours (`0 */6 * * *`). Accepts GET and POST identically.",
      { ok: true, created: 2 }
    ),
  },
  "/api/sync/planner": {
    get: cronOperation(
      "Run due Microsoft Planner syncs",
      "Executes any enabled Microsoft Planner syncs whose interval is due. Typically " +
        "scheduled every few minutes (`*/5 * * * *`). Accepts GET and POST identically.",
      { ok: true, ran: 1 }
    ),
    post: cronOperation(
      "Run due Microsoft Planner syncs",
      "Executes any enabled Microsoft Planner syncs whose interval is due. Typically " +
        "scheduled every few minutes (`*/5 * * * *`). Accepts GET and POST identically.",
      { ok: true, ran: 1 }
    ),
  },
  "/api/mcp": {
    get: {
      summary: "MCP discovery — identity and available operations",
      description:
        "Returns the user/tenant the token acts as, its scopes, and the operations it may " +
        "call. Used by the MCP server (`mcp/task-tracker-mcp.mjs`) and as a connectivity " +
        "check (see docs/MCP.md in the source repository).",
      tags: ["MCP"],
      security: [{ mcpToken: [] }],
      responses: {
        "200": {
          description: "Token is valid.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  user: { type: "object" },
                  tenant: { type: "object" },
                  scopes: { type: "array", items: { type: "string", enum: ["read", "write"] } },
                  ops: { type: "array", items: { type: "object" } },
                },
              },
              example: {
                ok: true,
                user: { id: "clx…", name: "Layla", username: "layla", role: "Admin" },
                tenant: { id: "clx…", slug: "acme", name: "Acme" },
                scopes: ["read", "write"],
                ops: [{ name: "create_task", scope: "write", describe: "Create a task…" }],
              },
            },
          },
        },
        "401": {
          description:
            "Missing, unknown, revoked or expired token — or its user is deactivated. All " +
            "four are reported identically so the endpoint cannot be used to probe tokens.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "unauthorized" } } },
        },
      },
    },
    post: {
      summary: "MCP operation call (RPC)",
      description:
        "Single RPC entry point: `{ \"op\": \"<name>\", \"params\": { … } }`. Deliberately not a " +
        "REST tree — an agent calls tools by name, so one dispatch point keeps the whole " +
        "machine-facing surface to exactly one auth check and one scope check.\n\n" +
        "Read ops: `whoami`, `list_tasks`, `get_task`, `list_steps`, `list_projects`. " +
        "Write ops (need the `write` scope): `create_task`, `update_task`, `add_comment`, " +
        "`log_prompt`, `add_step`, `complete_step`, `upload_attachment`, `create_project`.\n\n" +
        "Every op inherits the token user's permissions: a task in another tenant reports " +
        "`404 task not found`, never `403`.",
      tags: ["MCP"],
      security: [{ mcpToken: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["op"],
              properties: {
                op: { type: "string", description: "Operation name." },
                params: { type: "object", description: "Operation parameters; schema per op (strict — unknown keys are rejected)." },
              },
            },
            example: {
              op: "create_task",
              params: { title: "Kalender: Feiertage anzeigen", priority: "High", steps: ["Quelle waehlen", "Einbauen"] },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Operation ran.",
          content: {
            "application/json": {
              schema: { type: "object", properties: { ok: { type: "boolean" }, data: {} } },
              example: { ok: true, data: { id: "clx…", title: "Kalender: Feiertage anzeigen", status: "Todo", url: "/tasks/clx…" } },
            },
          },
        },
        "400": { description: "Malformed body, missing `op`, or params that fail the op's schema.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "invalid params: title — String must contain at least 1 character(s)" } } } },
        "401": { description: "Token missing or not usable.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "unauthorized" } } } },
        "403": { description: "Token lacks the op's scope, or the user may not perform it.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "op 'create_task' requires the 'write' scope" } } } },
        "404": { description: "Unknown op — or a task that does not exist *for this token's tenant*.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "task not found" } } } },
        "409": { description: "Blocked by the admin workflow gate (`TARGET_LOCKED`, `TODOS_OPEN`, `TIME_REQUIRED`).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "status change blocked: TODOS_OPEN" } } } },
        "413": { description: "Attachment exceeds the 10 MB upload limit.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "file too large (max 10485760 bytes)" } } } },
        "415": { description: "Attachment MIME type is not on the allowlist.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { ok: false, error: "mime type not allowed: text/html" } } } },
      },
    },
  },
  "/api/push": {
    post: {
      summary: "Register a Web-Push subscription",
      description:
        "Upserts the caller's browser push subscription (keyed by `endpoint`) so the server " +
        "can deliver notifications. Requires an authenticated session.",
      tags: ["Web Push"],
      security: [{ sessionCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PushSubscription" },
            example: {
              endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
              keys: { p256dh: "BENc7...mocth", auth: "tBHIt...9s7A" },
            },
          },
        },
      },
      responses: {
        "200": { description: "Stored.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } }, example: { ok: true } } } },
        "400": { description: "Missing `endpoint` or keys.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "invalid" } } } },
        "401": { description: "No session.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "unauthorized" } } } },
      },
    },
    delete: {
      summary: "Remove a Web-Push subscription",
      description: "Deletes the caller's subscription for the given `endpoint`. Idempotent.",
      tags: ["Web Push"],
      security: [{ sessionCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PushUnsubscribe" },
            example: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123" },
          },
        },
      },
      responses: {
        "200": { description: "Removed (or nothing matched).", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } }, example: { ok: true } } } },
        "401": { description: "No session.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "unauthorized" } } } },
      },
    },
  },
  "/download/attachment/{id}": {
    get: {
      summary: "Download a task attachment",
      description:
        "Streams an attachment as a forced download (`Content-Disposition: attachment`, " +
        "`application/octet-stream`). Access is tenant-scoped: the caller must be in the " +
        "attachment's tenant AND be an admin, the task creator, or the assignee.",
      tags: ["Attachments"],
      security: [{ sessionCookie: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "TaskAttachment id." },
      ],
      responses: {
        "200": {
          description: "The file bytes.",
          headers: {
            "Content-Disposition": { schema: { type: "string" }, example: "attachment; filename*=UTF-8''report.pdf" },
            "Cache-Control": { schema: { type: "string" }, example: "private, no-store" },
          },
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        "403": { description: "Authenticated but not allowed to view the task.", content: { "text/plain": { schema: { type: "string" }, example: "Forbidden" } } },
        "404": { description: "Not found, wrong tenant, or file missing on disk.", content: { "text/plain": { schema: { type: "string" }, example: "Not found" } } },
      },
    },
  },
  "/t/{slug}": {
    get: {
      summary: "Switch active tenant (BackendAdmin)",
      description:
        "Path-based tenant entry. For a BackendAdmin/SuperAdmin, sets the `tt_tenant` cookie " +
        "to the given tenant slug and redirects to `/`. For other roles the cookie is left " +
        "unchanged (they are hard-locked to their own tenant). Unauthenticated → `/login`.",
      tags: ["Tenancy"],
      security: [{ sessionCookie: [] }],
      parameters: [
        { name: "slug", in: "path", required: true, schema: { type: "string" }, description: "Tenant slug.", example: "acme" },
      ],
      responses: {
        "302": redirect302("Redirect to `/` (tenant cookie set for BackendAdmin) or `/login`.", "/"),
      },
    },
  },
  "/logout": {
    get: {
      summary: "Log out",
      description:
        "Destroys the current session (deletes the DB row and clears `tt_session`) and " +
        "redirects to `/login`. A plain GET navigation so it works inside the Capacitor " +
        "WebView, where form-POST Server Actions were unreliable.",
      tags: ["Authentication"],
      security: [{ sessionCookie: [] }],
      responses: {
        "303": redirect302("Redirect to `/login`; `tt_session` cleared; `Cache-Control: no-store`.", "/login"),
      },
    },
  },
  "/api/openapi.json": {
    get: {
      summary: "This OpenAPI document",
      description: "Returns this specification as JSON. Powers the Swagger-UI at `/api-docs`.",
      tags: ["Meta"],
      security: [],
      responses: {
        "200": { description: "The OpenAPI 3.1 document.", content: { "application/json": { schema: { type: "object" } } } },
      },
    },
  },
};

// ── Assembled document ───────────────────────────────────────────────────────
// TOF-0795 (Tarek 31.10.2026): Kontakt/Server-Adresse = Adresse der Instanz
// (src/lib/instance-url.ts: APP_URL > NEXT_PUBLIC_APP_URL > Build-Adresse).
// Die Route /api/openapi.json baut das Dokument zur Laufzeit; ohne APP_URL ist
// es identisch mit dem bisherigen.
export function buildOpenApiDocument(baseUrl: string = instanceUrl()): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "Task-Tracker API",
      version: VERSION,
      description: DESCRIPTION,
      contact: { name: "Task-Tracker", url: baseUrl },
      license: { name: "Proprietary" },
    },
    servers: [
      { url: baseUrl, description: "Production" },
      { url: "http://localhost:3000", description: "Local development" },
    ],
    tags: [
      { name: "Authentication", description: "Sign-in, OAuth/SSO, logout." },
      { name: "Cron & sync", description: "Machine-to-machine jobs guarded by `x-sync-secret`." },
      { name: "MCP", description: "Agent integration (Claude Code) via per-user machine tokens." },
      { name: "Web Push", description: "Browser push-notification subscriptions." },
      { name: "Attachments", description: "Tenant-scoped file downloads." },
      { name: "Tenancy", description: "Multi-tenant switching." },
      { name: "Meta", description: "The spec itself." },
    ],
    paths,
    components: {
      securitySchemes,
      schemas: {
        // Enums (from src/lib/enums.ts and src/lib/sso.ts)
        Role: enumSchema(ROLES, "User role. `BackendAdmin` (legacy `SuperAdmin`) spans all tenants."),
        TaskStatus: enumSchema(TASK_STATUSES, "Task lifecycle status."),
        TaskPriority: enumSchema(TASK_PRIORITIES, "Task priority."),
        TaskType: enumSchema(TASK_TYPES, "Issue hierarchy type (Epic > Story > Task > Subtask; Bug with Task)."),
        TaskLinkType: enumSchema(TASK_LINK_TYPES, "Relationship between two tasks."),
        Locale: enumSchema(LOCALES, "UI locale. `ar` is the default (RTL)."),
        SsoProvider: enumSchema(SSO_PROVIDERS, "Configured OAuth/OIDC identity providers."),
        // Domain models (mirror src/lib/validation.ts)
        Login,
        Task,
        Subtask,
        Progress,
        Project,
        Team,
        User,
        Comment,
        Settings,
        PushSubscription,
        PushUnsubscribe,
        CronResult,
        Error,
      },
    },
    "x-allowed-upload-mime-types": ALLOWED_MIME,
  };
}

/** Dokument mit der Build-Adresse (für scripts/gen-openapi.mjs und Tests). */
export const openApiDocument: Json = buildOpenApiDocument(SITE_URL);

export default openApiDocument;
