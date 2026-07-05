# Contributing

Thanks for working on Task Tracker. This doc covers dev setup, conventions,
and the PR process. For system design see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); for the HTTP/action surface see
[docs/API-DOCS.md](docs/API-DOCS.md).

## Setup

```bash
npm install
cp .env.example .env        # on Windows: copy .env.example .env
npx prisma migrate dev      # needs a running Postgres — see .env.example for a local docker one-liner
npm run dev
```

See the [README](README.md#quick-start) for demo credentials and the full
feature list.

## Branching & commits

- Branch names use a `<type>/<short-description>` prefix: `feat/…`, `fix/…`,
  `chore/…`, `docs/…`, `test/…`. Keep them short and specific
  (`feat/planner-sync`, not `feat/updates`).
- Commit messages: `<type>[(scope)]: <summary>`, e.g. `feat(notifications):
  in-app + web-push + email, per-user prefs`, `fix(apk): logout works in
  Capacitor WebView`, `i18n(ar): terminology + grammar QA pass`. Reference a
  PR/issue number in parentheses when one exists, e.g. `(#31)`.
- One logical change per commit where practical; a commit body can list
  bundled sub-items if a change genuinely spans several small features.
- Never commit `.env`, `*.db`, or anything under `public/uploads`.

## Before opening a PR

```bash
npm run lint
npm test              # unit tests (Vitest)
npm run build         # catches type errors + confirms it actually builds
npm run test:e2e      # Playwright — needs `npx playwright install chromium` once
```

If your change touches a `Task`, `Project`, `Team`, `Sprint`, `Notification`,
or any other tenant-scoped model, also run:

```bash
npm run audit:tenant   # fails on any multi-row Prisma query missing a tenantId filter
```

This is the same static audit CI runs — see
[docs/MULTI-TENANT-SECURITY.md](docs/MULTI-TENANT-SECURITY.md) for what it
checks and why unscoped queries are treated as a hard failure, not a warning.

## Adding a feature

- **Server Actions first**: business logic goes in `src/actions/*.ts` (one
  file per resource) or in a `src/lib/*.ts` module if it's pure logic — put it
  where an equivalent already lives rather than starting a new file, and add
  a co-located `*.test.ts` (Vitest) next to any new `src/lib` module.
- **Validate at the boundary**: add/extend a zod schema in
  `src/lib/validation.ts` for new mutation input; don't re-validate deeper in
  the call stack.
- **Never trust a client-supplied tenant or user id.** Re-derive both
  server-side from the session (`src/lib/auth.ts`, `src/lib/tenant.ts`) inside
  every new action/route.
- **Permission checks belong server-side** — extend `src/lib/roles.ts` /
  `src/lib/task-access.ts` rather than hiding UI and calling it done.
- Prefer a Server Action over a Route Handler unless the caller is external
  (browser-native fetch across origins, a webhook, a cron job) — see
  [docs/API-DOCS.md](docs/API-DOCS.md#adding-a-new-endpoint).

## i18n

The app is Arabic-first (RTL, default) with English and German. All three
dictionaries live as plain objects in `src/lib/i18n.ts`
(`dictionaries.ar` / `.en` / `.de`) — add a key to all three when you add
user-facing copy; don't hardcode a string in a component and don't leave a
key missing in one locale (it renders as the key itself as a runtime
fallback). Use logical CSS properties (`ms`/`me`/`ps`/`pe`/`start`/`end`)
instead of `ml`/`mr`/`left`/`right` so layouts flip correctly under RTL.

## Testing conventions

- **Unit tests** (Vitest): co-located as `<module>.test.ts` next to the
  `src/lib` file they cover. Business logic (hierarchy, automation, custom
  fields, notifications routing, planner-sync mapping, recurrence, roadmap
  zoom, RBAC, task links/access, workflow) should be testable without
  spinning up the UI — test the `src/lib` function directly.
- **E2E** (Playwright, `e2e/`): happy-path UI flows, plus dedicated tenant
  isolation specs (`tenant.spec.ts`, `tenant-isolation.spec.ts`). Add a new
  isolation test if you introduce a new tenant-scoped model or admin surface.
- **`e2e-live/`** is a read-only smoke suite safe to run against a real
  production deployment — never add a test there that mutates data.

## Documentation

If your change adds or changes user-facing behavior, update the relevant doc
in the same PR rather than leaving it to a follow-up:

| Change touches… | Update |
| --- | --- |
| Any user-facing feature | [docs/USER-GUIDE.md](docs/USER-GUIDE.md), and [README.md](README.md#features) if it's a headline feature |
| Admin-only screens/config | [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) |
| Data model / architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| A Server Action or Route Handler | [docs/API-DOCS.md](docs/API-DOCS.md) |
| Deployment / env vars | [docs/DEPLOY.md](docs/DEPLOY.md) |
| Any of the above, once released | [CHANGELOG.md](CHANGELOG.md) |

## Code review

PRs get reviewed for correctness, tenant-isolation safety, and consistency
with existing patterns before merge into `main`. Don't bypass CI checks
(lint, unit tests, e2e, tenant audit) to land a change faster — fix the
underlying issue instead.
