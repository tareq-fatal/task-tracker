import { describe, it, expect, vi } from "vitest";
import { RealtimeBus, type Connection, type RealtimeEvent } from "./realtime-core";

function conn(
  over: Partial<Connection> & { id: string }
): Connection & { events: RealtimeEvent[] } {
  const events: RealtimeEvent[] = [];
  return {
    tenantId: "t1",
    userId: `user-${over.id}`,
    userName: `User ${over.id}`,
    send: (e) => void events.push(e),
    events,
    ...over,
  };
}

describe("RealtimeBus", () => {
  it("broadcasts the presence list on join and leave", () => {
    const bus = new RealtimeBus();
    const a = conn({ id: "a", userId: "u1", userName: "Anna" });
    bus.add(a);
    expect(a.events.at(-1)).toEqual({
      type: "presence",
      online: [{ id: "u1", name: "Anna" }],
    });

    const b = conn({ id: "b", userId: "u2", userName: "Ben" });
    const removeB = bus.add(b);
    expect(a.events.at(-1)).toMatchObject({
      type: "presence",
      online: [
        { id: "u1", name: "Anna" },
        { id: "u2", name: "Ben" },
      ],
    });

    removeB();
    expect(a.events.at(-1)).toEqual({
      type: "presence",
      online: [{ id: "u1", name: "Anna" }],
    });
  });

  it("keeps a user online while they still hold another connection", () => {
    const bus = new RealtimeBus();
    const tab1 = conn({ id: "tab1", userId: "u1", userName: "Anna" });
    const tab2 = conn({ id: "tab2", userId: "u1", userName: "Anna" });
    bus.add(tab1);
    const removeTab2 = bus.add(tab2);
    expect(bus.onlineUsers("t1")).toEqual([{ id: "u1", name: "Anna" }]);

    removeTab2();
    expect(bus.onlineUsers("t1")).toEqual([{ id: "u1", name: "Anna" }]);
    bus.remove("tab1");
    expect(bus.onlineUsers("t1")).toEqual([]);
  });

  it("scopes toTenant to the tenant and honors exceptUserId", () => {
    const bus = new RealtimeBus();
    const a = conn({ id: "a", tenantId: "t1", userId: "u1" });
    const b = conn({ id: "b", tenantId: "t1", userId: "u2" });
    const other = conn({ id: "c", tenantId: "t2", userId: "u3" });
    bus.add(a);
    bus.add(b);
    bus.add(other);
    [a, b, other].forEach((c) => (c.events.length = 0));

    const event: RealtimeEvent = { type: "task.changed", taskId: "x", actorUserId: "u1" };
    bus.toTenant("t1", event, { exceptUserId: "u1" });

    expect(a.events).toEqual([]);
    expect(b.events).toEqual([event]);
    expect(other.events).toEqual([]);
  });

  it("delivers toUsers to every connection of the targeted users only", () => {
    const bus = new RealtimeBus();
    const tab1 = conn({ id: "a", userId: "u1" });
    const tab2 = conn({ id: "b", userId: "u1" });
    const c = conn({ id: "c", userId: "u2" });
    const foreign = conn({ id: "d", tenantId: "t2", userId: "u1" });
    [tab1, tab2, c, foreign].forEach((x) => bus.add(x));
    [tab1, tab2, c, foreign].forEach((x) => (x.events.length = 0));

    bus.toUsers("t1", ["u1"], { type: "notification" });

    expect(tab1.events).toEqual([{ type: "notification" }]);
    expect(tab2.events).toEqual([{ type: "notification" }]);
    expect(c.events).toEqual([]);
    // same user id but different tenant → untouched
    expect(foreign.events).toEqual([]);
  });

  it("drops a connection whose send() throws without breaking the others", () => {
    const bus = new RealtimeBus();
    const dead = conn({ id: "dead", userId: "u1" });
    // survives the join broadcast, dies once real traffic arrives
    dead.send = vi.fn((e: RealtimeEvent) => {
      if (e.type === "task.changed") throw new Error("controller closed");
    });
    const alive = conn({ id: "alive", userId: "u2" });
    bus.add(dead);
    bus.add(alive);
    alive.events.length = 0;

    bus.toTenant("t1", { type: "task.changed", taskId: "x" });

    // dead connection was purged, presence updated for the survivor
    expect(bus.onlineUsers("t1")).toEqual([{ id: "u2", name: "User alive" }]);
    expect(alive.events).toContainEqual({ type: "task.changed", taskId: "x" });
    expect(alive.events).toContainEqual({
      type: "presence",
      online: [{ id: "u2", name: "User alive" }],
    });
  });

  it("sorts the presence list by name for stable rendering", () => {
    const bus = new RealtimeBus();
    bus.add(conn({ id: "a", userId: "u1", userName: "Zoe" }));
    bus.add(conn({ id: "b", userId: "u2", userName: "Anna" }));
    expect(bus.onlineUsers("t1").map((u) => u.name)).toEqual(["Anna", "Zoe"]);
  });
});
