import "server-only";

/**
 * In-process Server-Sent-Events bus for live notification counts.
 *
 * Every open browser tab registers a writer keyed by userId; the central
 * fan-out (`notify()` in src/lib/notifications.ts) calls `publish()` to push a
 * "new notification" frame to all of that user's tabs the instant an in-app
 * notification is created — so the bell badge updates live instead of polling.
 *
 * Single-instance only: an in-process Map reaches only tabs connected to the
 * same Node process. If the app is scaled to multiple instances behind a load
 * balancer, back this with Postgres LISTEN/NOTIFY or Redis pub/sub instead.
 */
type Writer = (chunk: string) => void;

// Survive module reloads (dev HMR) by hanging the registry off globalThis.
const g = globalThis as unknown as { __ttNotifClients?: Map<string, Set<Writer>> };
const clients: Map<string, Set<Writer>> = (g.__ttNotifClients ??= new Map());

/** Register a per-tab writer. Returns an unregister function. */
export function registerClient(userId: string, write: Writer): () => void {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(write);
  return () => {
    const s = clients.get(userId);
    if (!s) return;
    s.delete(write);
    if (s.size === 0) clients.delete(userId);
  };
}

/** Push a payload to every open tab of one user. Best-effort, never throws. */
export function publish(userId: string, payload: unknown): void {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const write of set) {
    try {
      write(frame);
    } catch {
      /* writer already closed; cleanup runs on the stream's cancel handler */
    }
  }
}
