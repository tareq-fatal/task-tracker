import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { getActiveTenant } from "@/lib/tenant";
import { realtimeBus } from "@/lib/realtime";
import type { RealtimeEvent } from "@/lib/realtime-core";

/**
 * SSE endpoint — the single realtime downlink per browser tab.
 *
 * SSE over WebSockets on purpose: Next.js route handlers can hold a streaming
 * response without a custom server (works in the standalone Docker build
 * behind Caddy), EventSource ships auto-reconnect for free, and all our
 * traffic is server→client; the rare client→server message (cursor moves)
 * goes through a plain POST (see ./cursor/route.ts).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Keep-alive comment interval — well below common proxy idle timeouts (60s). */
const HEARTBEAT_MS = 25_000;

export async function GET(req: NextRequest) {
  const ctx = await getActiveTenant();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { user, tenant } = ctx;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const send = (event: RealtimeEvent) => {
        write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // Reconnect delay for the browser's native EventSource retry.
      write(`retry: 3000\n\n`);

      const unregister = realtimeBus.add({
        id: randomBytes(9).toString("hex"),
        tenantId: tenant.id,
        userId: user.id,
        userName: user.name,
        send,
      });
      // Presence snapshot so a fresh tab renders the list immediately.
      send({ type: "presence", online: realtimeBus.onlineUsers(tenant.id) });

      const heartbeat = setInterval(() => {
        try {
          write(`: ping\n\n`);
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      let done = false;
      cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(heartbeat);
        unregister();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: keep proxies (Caddy) from buffering/compressing the stream
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
