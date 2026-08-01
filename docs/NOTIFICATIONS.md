# Notifications (PR-B)

Multi-channel notifications: **in-app bell**, **web-push**, **email**, **native push**.

## Channels & events

Events (each toggleable per channel, per user, in Settings → Notification preferences):
`assigned`, `status`, `comment`, `mention` (@username), `due_soon` (24h), `overdue`,
`blocker_resolved` (a DependsOn blocker completed), `recurring` (instance spawned).

- **In-app** — always available; bell icon in the header with unread badge + dropdown.
- **Web-push** — needs VAPID keys (existing PushToggle in Settings).
- **Email** — via Resend; off unless `RESEND_API_KEY` is set.
- **Native push** — Capacitor APK; needs `FCM_SERVER_KEY` + a registered device token.

Per-user: **quiet hours** (suppress push/email/native instantly, keep in-app) and
a **daily digest** flag.

## Setup (env)

```bash
# Web push (generate once with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@coastshield.net

# Email (Resend) — optional
RESEND_API_KEY=...
EMAIL_FROM="Task Tracker <noreply@tasks.coastshield.net>"

# Native push (FCM) — optional, for the APK
FCM_SERVER_KEY=...

# Reminder cron guard (reused from sync)
SYNC_SECRET=...
```

## Reminder cron (due-soon / overdue)

```cron
0 7 * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/notifications
```
Deduped to once per ~20h per task/type. Returns `{ ok, dueSoon, overdue }`.

## Retention cron (auto-delete old notifications)

```cron
15 3 * * *  curl -H "x-sync-secret: $SYNC_SECRET" https://tasks.coastshield.net/api/cron/notification-retention
```
Deletes notifications and activity-log entries older than each tenant's
`notificationRetentionDays` (default 30, configurable by tenant admins under
Settings → notification retention). Admins can also purge manually on
`/admin/notifications` and `/admin/activity` ("delete old" / "delete all").
Returns `{ ok, tenants, notifications, activities }`.

## Testing status

- ✅ Unit: routing/quiet-hours/mentions (`notifications-core.test.ts`, 12 tests).
- ✅ E2E: bell in header, settings matrix, assign-creates-notification, cron guard.
- ⏳ Real web-push / email / native delivery need the env keys above; without them
  the in-app channel still works and the others are graceful no-ops.
