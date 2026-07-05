import type { NextRequest } from "next/server";
import { z } from "zod";
import { getActiveTenant } from "@/lib/tenant";
import { realtimeBus } from "@/lib/realtime";

/**
 * Client→server uplink for live cursors (SSE is one-way, so cursor moves
 * arrive as throttled POSTs and are fanned back out over the SSE stream).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cursorSchema = z.object({
  /** Shared room id, e.g. "task:<cuid>" on the task detail page. */
  room: z.string().regex(/^task:[a-zA-Z0-9_-]{1,40}$/),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** True when the user leaves the room (unmount/pagehide beacon). */
  gone: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getActiveTenant();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { user, tenant } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const parsed = cursorSchema.safeParse(body);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  const { room, x, y, gone } = parsed.data;
  realtimeBus.toTenant(
    tenant.id,
    {
      type: "cursor",
      room,
      user: { id: user.id, name: user.name },
      x,
      y,
      ...(gone ? { gone: true } : {}),
    },
    { exceptUserId: user.id }
  );

  return Response.json({ ok: true });
}
