import "server-only";
import { prisma } from "./prisma";
import { clampRetentionDays, retentionCutoff } from "./retention-policy";

/**
 * Daily retention sweep: per tenant, delete notifications and activity-log
 * entries older than the tenant's configured notificationRetentionDays.
 * Invoked by /api/cron/notification-retention.
 */
export async function runNotificationRetention(now: Date = new Date()): Promise<{
  tenants: number;
  notifications: number;
  activities: number;
}> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, notificationRetentionDays: true },
  });

  let notifications = 0;
  let activities = 0;
  for (const t of tenants) {
    const cutoff = retentionCutoff(clampRetentionDays(t.notificationRetentionDays), now);
    const n = await prisma.notification.deleteMany({
      where: { tenantId: t.id, createdAt: { lt: cutoff } },
    });
    // ActivityLog has no tenantId column — scope via the owning task.
    const a = await prisma.activityLog.deleteMany({
      where: { task: { tenantId: t.id }, createdAt: { lt: cutoff } },
    });
    notifications += n.count;
    activities += a.count;
  }
  return { tenants: tenants.length, notifications, activities };
}
