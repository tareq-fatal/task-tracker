import "server-only";
import { RealtimeBus } from "./realtime-core";

/**
 * Process-wide bus singleton. Stored on globalThis unconditionally (not just
 * in dev like prisma.ts): Next.js may bundle this module into several webpack
 * chunks (route handlers vs. server actions), and each chunk would otherwise
 * get its own module instance — publishes from actions would never reach the
 * SSE route's subscribers.
 */
const g = globalThis as unknown as { __realtimeBus?: RealtimeBus };
export const realtimeBus = (g.__realtimeBus ??= new RealtimeBus());

/** Tell a tenant's open views that a task changed (they refetch, debounced). */
export function publishTaskChanged(
  tenantId: string,
  taskId: string,
  actorUserId?: string
): void {
  realtimeBus.toTenant(tenantId, { type: "task.changed", taskId, actorUserId });
}

/** Nudge specific users' notification bells to refresh immediately. */
export function publishNotification(tenantId: string, userIds: string[]): void {
  realtimeBus.toUsers(tenantId, userIds, { type: "notification" });
}
