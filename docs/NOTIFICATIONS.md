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

## @-mentions

Typing `@` in a comment opens a people picker (`MentionTextarea`) and inserts the
**username** — `parseMentions` resolves mentions by username, not display name.
A mention fires the `mention` event on every channel the recipient has enabled
(in-app, web-push, Telegram — which rides the web-push preference — email,
native), and the mentioned person is left out of the broader `comment`
notification so nobody is pinged twice.

Who can be mentioned is gated on **task visibility** (`canSeeTask`): staff see
the whole tenant, everyone else only tasks they are involved in. The gate holds
in both directions — the picker offers nobody else, and `notifyMentions` drops a
hand-typed `@name` for someone without access. Without it, a mention would push
the task title into a stranger's Telegram and link them to a task they can't
open. The UI and the MCP `add_comment` op share that one helper.

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
