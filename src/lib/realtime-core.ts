/**
 * Realtime event bus — pure in-memory pub/sub, tenant-scoped.
 *
 * One instance lives per Node process (see realtime.ts for the globalThis
 * singleton). SSE connections register themselves here; server actions and
 * route handlers publish events into it. Presence ("who is online") falls out
 * of the connection registry for free: a user is online while they hold at
 * least one open SSE connection.
 *
 * Scaling note: this bus is process-local. The app deploys as a single
 * standalone Node container behind Caddy, so that is sufficient. Running
 * multiple replicas would require replacing the internals with a shared
 * pub/sub (e.g. Redis) — the public API here would stay the same.
 */

export type PresenceUser = { id: string; name: string };

export type RealtimeEvent =
  /** A task was created/updated/deleted — views should refetch. */
  | { type: "task.changed"; taskId: string; actorUserId?: string }
  /** The recipient has new/changed in-app notifications. */
  | { type: "notification" }
  /** Full snapshot of the tenant's online users. */
  | { type: "presence"; online: PresenceUser[] }
  /** Another user's cursor inside a shared room (e.g. "task:<id>"). */
  | {
      type: "cursor";
      room: string;
      user: PresenceUser;
      x: number;
      y: number;
      gone?: boolean;
    };

export type RealtimeEventType = RealtimeEvent["type"];

export type Connection = {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  /** Push one event down this connection's wire. May throw when dead. */
  send: (event: RealtimeEvent) => void;
};

export class RealtimeBus {
  private connections = new Map<string, Connection>();

  /**
   * Register a connection. Sends the presence snapshot to the newcomer and
   * broadcasts the updated presence list to the tenant. Returns the
   * unregister function (idempotent).
   */
  add(conn: Connection): () => void {
    this.connections.set(conn.id, conn);
    this.broadcastPresence(conn.tenantId);
    return () => this.remove(conn.id);
  }

  remove(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    this.connections.delete(connectionId);
    this.broadcastPresence(conn.tenantId);
  }

  /** Distinct online users of a tenant, sorted by name for stable UI. */
  onlineUsers(tenantId: string): PresenceUser[] {
    const byId = new Map<string, PresenceUser>();
    for (const c of this.connections.values()) {
      if (c.tenantId === tenantId) {
        byId.set(c.userId, { id: c.userId, name: c.userName });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Broadcast to every connection of a tenant (optionally skipping a user). */
  toTenant(
    tenantId: string,
    event: RealtimeEvent,
    opts?: { exceptUserId?: string }
  ): void {
    for (const c of [...this.connections.values()]) {
      if (c.tenantId !== tenantId) continue;
      if (opts?.exceptUserId && c.userId === opts.exceptUserId) continue;
      this.deliver(c, event);
    }
  }

  /** Send to specific users (all their connections) within a tenant. */
  toUsers(tenantId: string, userIds: string[], event: RealtimeEvent): void {
    if (userIds.length === 0) return;
    const targets = new Set(userIds);
    for (const c of [...this.connections.values()]) {
      if (c.tenantId === tenantId && targets.has(c.userId)) {
        this.deliver(c, event);
      }
    }
  }

  /** A send() that throws marks the connection dead — drop it, move on. */
  private deliver(conn: Connection, event: RealtimeEvent): void {
    try {
      conn.send(event);
    } catch {
      this.remove(conn.id);
    }
  }

  private broadcastPresence(tenantId: string): void {
    const event: RealtimeEvent = {
      type: "presence",
      online: this.onlineUsers(tenantId),
    };
    for (const c of [...this.connections.values()]) {
      if (c.tenantId === tenantId) this.deliver(c, event);
    }
  }
}
