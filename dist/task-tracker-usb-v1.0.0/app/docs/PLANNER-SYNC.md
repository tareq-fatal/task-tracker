# MS Planner Sync (PR-C)

Synchronize a Task-Tracker **project** with a Microsoft **Planner plan** —
pull, push, or two-way — via the Microsoft Graph API.

## How it works

- Uses the **same Azure AD app** as SSO, but with the **client-credentials**
  (app-only) flow so background sync runs without a signed-in user.
- Each tenant admin links a project to a plan in **Settings → MS Planner Sync**
  (plan id + direction). State is stored per project in `PlannerSync`.
- **Mapping** (pure, unit-tested in `src/lib/planner-sync.ts`):
  - `percentComplete` 0 / 50 / 100 → status `Todo` / `InProgress` / `Done`
  - Planner priority 1/3/5/9 → `Critical` / `High` / `Medium` / `Low`
  - `dueDateTime` → `dueDate`; bucket name kept in `Task.bucket`
  - tasks matched by `Task.externalId` = Graph task id (idempotent)
- **Direction:**
  - `pull` — Planner → Tracker (create/update local; never writes to Planner)
  - `push` — Tracker → Planner (PATCH changed; create local-only tasks in Planner)
  - `two-way` — both; **Planner wins** on a conflicting matched pair
- **Continuous sync:** an external scheduler calls the cron endpoint; each
  `PlannerSync` runs at most every `intervalMin` (default 5 min).

## Required Azure setup (your part)

1. In the Azure AD app (the SSO one), add **application** permissions:
   `Tasks.ReadWrite.All` (and `Group.Read.All` to list plans), then **grant admin consent**.
2. Ensure these env vars are set in `.env.task-tracker` (shared with SSO):
   ```bash
   AZURE_AD_CLIENT_ID=...
   AZURE_AD_CLIENT_SECRET=...
   AZURE_AD_TENANT_ID=<your directory/tenant id>   # NOT "common" for app-only
   SYNC_SECRET=<long-random-string>                 # guards the cron endpoint
   ```
3. Find a plan id: open the plan in Planner; the URL contains `planId=...`,
   or call `GET /groups/{groupId}/planner/plans`.

## Continuous sync (cron)

Point any scheduler at the guarded endpoint every few minutes:

```cron
*/5 * * * * curl -s -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/sync/planner
```

It returns `{ ok: true, ran: N }`. Without `SYNC_SECRET` it returns 503 (disabled);
with a wrong/missing header it returns 401.

## Testing status

- ✅ Unit-tested: all mapping + the `diffPlannerTasks` engine (pull/push/two-way,
  create/update/conflict, bucket-name resolution) — `src/lib/planner-sync.test.ts`.
- ✅ E2E-tested: admin sees the card (shows "not configured" without Azure env),
  normal users don't, cron endpoint rejects unauthenticated calls.
- ⏳ **Live Graph round-trip is not automatically tested** — needs the app
  permissions + admin consent above. After granting consent, link a small test
  plan and click **Sync now** to verify, then enable the cron.
```
