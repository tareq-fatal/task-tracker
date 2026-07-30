# Multi-Tenant Isolation — verification & hardening

## How isolation works (today)

Every tenant-scoped query is filtered by `tenantId` (or by `taskVisibility(user,
tenantId)`), and the active tenant is resolved server-side in `src/lib/tenant.ts`:

- **SuperAdmin** — may switch tenants via the `tt_tenant` cookie (`/t/{slug}`).
- **Everyone else** — HARD-LOCKED to their own tenant; the cookie is ignored.

Detail pages additionally enforce `resource.tenantId !== tenant.id → notFound()`
(HTTP 404), so a guessed/leaked ID from another tenant is never readable.

## Static audit

`node scripts/audit-tenant-scope.mjs` (also `npm run audit:tenant`) scans every
Prisma query on a tenant-scoped model and fails CI if any multi-row query lacks
a tenant filter.

Latest run:

```
Tenant-scoped Prisma queries audited: 96
  ✓ multi-row queries scoped by tenantId/visibility: 55
  • by-id queries (post-fetch tenantId check pattern):  25
  ⚙ system-cron queries (cross-tenant by design):       12   (planner/recurring/notification runners)
  ✗ UNGUARDED multi-row queries: 0
```

## Behavioral tests

- `e2e/tenant.spec.ts` — a tenant user only sees their tenant's data; cannot
  switch via `/t/{slug}`; SuperAdmin can switch and sees that tenant's data.
- `e2e/tenant-isolation.spec.ts` — tenant user hard-locked; foreign data never
  visible; non-admins bounced from admin pages.

## Optional defense-in-depth: PostgreSQL Row-Level Security

The app already filters by `tenantId`, but RLS makes the database refuse
cross-tenant rows even if a query ever forgot the filter. To enable, the app
must `SET app.current_tenant` at the start of each request's transaction, then:

```sql
-- Run once per tenant-scoped table (Task shown; repeat for Project, Team,
-- Sprint, Notification, PlannerSync, TenantAuthProvider, ...).
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Task"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

-- The app DB role must NOT be the table owner / BYPASSRLS, or FORCE is required
-- (done above). SuperAdmin cross-tenant reads then need app.current_tenant set
-- per the active tenant on each request (already resolved in lib/tenant.ts).
```

**Not auto-enabled**: turning RLS on without the per-request `SET app.current_tenant`
plumbing would break every query. Enable deliberately with the session-var wiring
+ a staging soak. The current `tenantId`-on-every-query design + the audit above
already provide strong isolation.
