"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  PresenceUser,
  RealtimeEvent,
  RealtimeEventType,
} from "@/lib/realtime-core";

/**
 * Opens ONE SSE connection per tab (/api/realtime) and fans events out to
 * subscribed components. Also owns the presence list and the reconnect logic:
 * EventSource retries transient drops natively; on fatal errors (readyState
 * CLOSED, e.g. after a 401 or a proxy reset) we rebuild the connection with
 * exponential backoff, and immediately when the tab becomes visible again.
 */

type Handler = (event: RealtimeEvent) => void;

type RealtimeContextValue = {
  connected: boolean;
  online: PresenceUser[];
  /** Bumped on every REconnect — subscribers refetch to catch missed events. */
  syncTick: number;
  subscribe: (type: RealtimeEventType, handler: Handler) => () => void;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  online: [],
  syncTick: 0,
  subscribe: () => () => {},
});

const EVENT_TYPES: RealtimeEventType[] = [
  "task.changed",
  "notification",
  "presence",
  "cursor",
];

const MAX_BACKOFF_MS = 30_000;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [syncTick, setSyncTick] = useState(0);

  const handlersRef = useRef(new Map<RealtimeEventType, Set<Handler>>());
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const openedOnceRef = useRef(false);

  const subscribe = useCallback(
    (type: RealtimeEventType, handler: Handler) => {
      const map = handlersRef.current;
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(handler);
      return () => {
        map.get(type)?.delete(handler);
      };
    },
    []
  );

  useEffect(() => {
    let disposed = false;

    function connect() {
      if (disposed || sourceRef.current) return;
      const es = new EventSource("/api/realtime");
      sourceRef.current = es;

      es.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
        if (openedOnceRef.current) setSyncTick((n) => n + 1);
        openedOnceRef.current = true;
      };

      es.onerror = () => {
        setConnected(false);
        // CONNECTING = the browser is already retrying on its own (retry: 3s).
        if (es.readyState !== EventSource.CLOSED) return;
        es.close();
        sourceRef.current = null;
        const delay =
          Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attemptRef.current) +
          Math.random() * 500;
        attemptRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (e) => {
          let event: RealtimeEvent;
          try {
            event = JSON.parse((e as MessageEvent).data);
          } catch {
            return;
          }
          if (event.type === "presence") setOnline(event.online);
          handlersRef.current.get(type)?.forEach((h) => h(event));
        });
      }
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      // Dead connection while hidden? Reconnect now instead of waiting out
      // the backoff timer.
      if (!sourceRef.current) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        attemptRef.current = 0;
        connect();
      }
    }

    connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ connected, online, syncTick, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Refresh the current route's server data when any task changes (debounced —
 * a burst of events triggers one refetch). Pass `paused` (e.g. while a card
 * is being dragged) to defer the refresh until the interaction ends.
 */
export function useTaskChangeRefresh(refresh: () => void, paused = false) {
  const { subscribe, syncTick } = useRealtime();
  const pausedRef = useRef(paused);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  pausedRef.current = paused;

  useEffect(() => {
    const unsubscribe = subscribe("task.changed", () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pausedRef.current) pendingRef.current = true;
        else refreshRef.current();
      }, 250);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subscribe]);

  // Interaction ended with a queued refresh? Run it now.
  useEffect(() => {
    if (!paused && pendingRef.current) {
      pendingRef.current = false;
      refreshRef.current();
    }
  }, [paused]);

  // After a reconnect we may have missed events — resync once.
  const lastTickRef = useRef(syncTick);
  useEffect(() => {
    if (syncTick !== lastTickRef.current) {
      lastTickRef.current = syncTick;
      if (pausedRef.current) pendingRef.current = true;
      else refreshRef.current();
    }
  }, [syncTick]);
}
