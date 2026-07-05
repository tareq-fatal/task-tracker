"use client";

import { useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/realtime-provider";

/**
 * Live cursors for co-viewing (#multi-user editing): everyone with the same
 * task detail open sees the others' pointers. Positions travel as viewport
 * fractions (0..1), so they map to "roughly the same spot" across different
 * screen sizes — presence-grade, not pixel-perfect.
 *
 * Uplink: throttled POST /api/realtime/cursor (SSE is server→client only).
 * Downlink: "cursor" events on the shared SSE stream, filtered by room.
 */

const SEND_INTERVAL_MS = 80;
const STALE_MS = 6_000;

const CURSOR_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#ec4899", // pink
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];

function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
}

type RemoteCursor = { name: string; x: number; y: number; ts: number };

export function LiveCursors({ room }: { room: string }) {
  const { subscribe, online } = useRealtime();
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const lastSentRef = useRef(0);
  // No audience → don't spam the uplink.
  const aloneRef = useRef(true);
  aloneRef.current = online.length <= 1;

  // Receive other users' cursors for this room.
  useEffect(() => {
    return subscribe("cursor", (event) => {
      if (event.type !== "cursor" || event.room !== room) return;
      setCursors((prev) => {
        const next = new Map(prev);
        if (event.gone) next.delete(event.user.id);
        else
          next.set(event.user.id, {
            name: event.user.name,
            x: event.x,
            y: event.y,
            ts: Date.now(),
          });
        return next;
      });
    });
  }, [subscribe, room]);

  // Drop cursors that stopped updating (tab closed without a beacon).
  useEffect(() => {
    const id = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        if (![...prev.values()].some((c) => now - c.ts > STALE_MS)) return prev;
        const next = new Map(prev);
        for (const [k, v] of next) if (now - v.ts > STALE_MS) next.delete(k);
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Broadcast own cursor (throttled); say goodbye on leave.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (aloneRef.current) return;
      const now = Date.now();
      if (now - lastSentRef.current < SEND_INTERVAL_MS) return;
      lastSentRef.current = now;
      const payload = {
        room,
        x: Math.min(1, Math.max(0, e.clientX / window.innerWidth)),
        y: Math.min(1, Math.max(0, e.clientY / window.innerHeight)),
      };
      fetch("/api/realtime/cursor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }

    function goodbye() {
      try {
        navigator.sendBeacon(
          "/api/realtime/cursor",
          new Blob([JSON.stringify({ room, x: 0, y: 0, gone: true })], {
            type: "application/json",
          })
        );
      } catch {
        /* best-effort */
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("pagehide", goodbye);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pagehide", goodbye);
      goodbye();
    };
  }, [room]);

  if (cursors.size === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {[...cursors.entries()].map(([userId, c]) => {
        const color = colorFor(userId);
        return (
          <div
            key={userId}
            className="absolute transition-all duration-100 ease-out"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={color}
              stroke="white"
              strokeWidth="1.5"
            >
              <path d="M4 2l16 8.5-7 1.5-3.5 6.5L4 2z" />
            </svg>
            <span
              className="ms-3 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow"
              style={{ backgroundColor: color }}
            >
              {c.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
