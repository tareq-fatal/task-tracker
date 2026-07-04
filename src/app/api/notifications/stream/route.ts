import { getCurrentUser } from "@/lib/auth";
import { registerClient } from "@/lib/notification-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live unread-count stream (Server-Sent Events).
 *
 * The notification bell opens this once per session and bumps its badge the
 * instant `notify()` fans out an in-app notification, instead of polling every
 * 60 seconds. Authenticated by the httpOnly session cookie (sent automatically
 * by EventSource on same-origin requests).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* controller closed between checks */
        }
      };

      // reconnect hint + an initial frame so the client knows the stream is live
      write("retry: 5000\n\n");
      write(`data: ${JSON.stringify({ kind: "ready" })}\n\n`);

      const unregister = registerClient(user.id, write);
      const ping = setInterval(() => write(": ping\n\n"), 25000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unregister();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
