import { describe, it, expect } from "vitest";
import { bucketOf, pickNextUp, hiddenCount, NEXT_UP_LIMIT, type NextUpTask } from "./next-up";

const task = (over: Partial<NextUpTask> = {}): NextUpTask => ({
  id: Math.random().toString(36).slice(2),
  status: "InProgress",
  priority: "Medium",
  dueDate: null,
  scrumColumn: null,
  blockedByOpen: 0,
  ...over,
});

describe("bucketOf", () => {
  it("drops everything that is finished", () => {
    expect(bucketOf(task({ status: "Done" }))).toBeNull();
    expect(bucketOf(task({ status: "Archived" }))).toBeNull();
    expect(bucketOf(task({ scrumColumn: "done" }))).toBeNull();
    expect(bucketOf(task({ scrumColumn: "ready-for-golive" }))).toBeNull();
  });

  it("puts the Prüf-Spalte first, before anything else it might also match", () => {
    // Blocked AND awaiting verification → verification wins: it is the one
    // bucket that needs a human decision, not more work.
    expect(bucketOf(task({ scrumColumn: "to-verify", blockedByOpen: 2 }))).toBe("verify");
  });

  it("counts an open dependency as blocked", () => {
    expect(bucketOf(task({ blockedByOpen: 1 }))).toBe("blocked");
    expect(bucketOf(task({ blockedByOpen: 0 }))).toBe("doing");
  });

  it("maps the waiting column onto 'wartet auf Entscheidung'", () => {
    expect(bucketOf(task({ scrumColumn: "waiting" }))).toBe("decide");
  });

  it("treats a plain Todo as work in flight", () => {
    expect(bucketOf(task({ status: "Todo" }))).toBe("doing");
  });
});

describe("pickNextUp", () => {
  it("never returns more than the limit, however many tasks come in", () => {
    const many = Array.from({ length: 164 }, () => task());
    const total = pickNextUp(many).reduce((n, g) => n + g.tasks.length, 0);
    expect(total).toBe(NEXT_UP_LIMIT);
  });

  it("keeps the bucket order: verify → blocked → decide → doing", () => {
    const rows = [
      task({ scrumColumn: "waiting" }),
      task({ blockedByOpen: 1 }),
      task(),
      task({ scrumColumn: "to-verify" }),
    ];
    expect(pickNextUp(rows).map((g) => g.bucket)).toEqual(["verify", "blocked", "decide", "doing"]);
  });

  it("spends the budget on the earlier buckets first", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => task({ scrumColumn: "to-verify" })),
      ...Array.from({ length: 8 }, () => task({ blockedByOpen: 1 })),
      ...Array.from({ length: 8 }, () => task()),
    ];
    const groups = pickNextUp(rows, 10);
    expect(groups.map((g) => [g.bucket, g.tasks.length])).toEqual([
      ["verify", 8],
      ["blocked", 2],
    ]);
  });

  it("sorts inside a bucket by priority, then by due date", () => {
    const low = task({ priority: "Low" });
    const critical = task({ priority: "Critical" });
    const highSoon = task({ priority: "High", dueDate: "2026-08-15" });
    const highLater = task({ priority: "High", dueDate: "2026-09-01" });
    const highNoDate = task({ priority: "High" });
    const [group] = pickNextUp([low, highLater, highNoDate, critical, highSoon]);
    expect(group.tasks.map((t) => t.id)).toEqual([
      critical.id,
      highSoon.id,
      highLater.id,
      highNoDate.id,
      low.id,
    ]);
  });

  it("leaves out finished tasks entirely", () => {
    const groups = pickNextUp([task({ status: "Done" }), task({ status: "Archived" })]);
    expect(groups).toEqual([]);
  });
});

describe("hiddenCount", () => {
  it("reports what the cut-off swallowed", () => {
    expect(hiddenCount(Array.from({ length: 25 }, () => task()))).toBe(15);
    expect(hiddenCount(Array.from({ length: 3 }, () => task()))).toBe(0);
    // Done tasks were never candidates, so they are not "hidden".
    expect(hiddenCount(Array.from({ length: 30 }, () => task({ status: "Done" })))).toBe(0);
  });
});
