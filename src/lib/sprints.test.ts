import { describe, it, expect } from "vitest";
import { sprintBurndown, velocity, averageVelocity } from "./sprints";

describe("sprintBurndown", () => {
  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-06-05T00:00:00Z"); // 5-day sprint
  const now = new Date("2026-06-03T12:00:00Z"); // mid-sprint

  it("one point per day with an ideal trend from total to 0", () => {
    const tasks = [
      { completedAt: null },
      { completedAt: new Date("2026-06-02T10:00:00Z") },
      { completedAt: null },
      { completedAt: null },
    ];
    const pts = sprintBurndown(tasks, start, end, now);
    expect(pts.map((p) => p.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
    expect(pts[0].ideal).toBe(4); // total
    expect(pts[4].ideal).toBe(0); // last day → 0
    expect(pts[0].remaining).toBe(4); // none done on day 1
    expect(pts[1].remaining).toBe(3); // one completed on the 2nd
  });

  it("future days have null remaining (line stops at today)", () => {
    const pts = sprintBurndown([{ completedAt: null }], start, end, now);
    expect(pts[2].remaining).not.toBeNull(); // the 3rd = today
    expect(pts[3].remaining).toBeNull(); // the 4th = future
    expect(pts[4].remaining).toBeNull();
  });
});

describe("velocity / averageVelocity", () => {
  const sprints = [
    { name: "S1", tasks: [{ status: "Done" }, { status: "Done" }, { status: "Todo" }] },
    { name: "S2", tasks: [{ status: "Done" }] },
    { name: "S3", tasks: [{ status: "Done" }, { status: "Done" }, { status: "Done" }] },
  ];
  it("counts completed vs total per sprint", () => {
    expect(velocity(sprints)).toEqual([
      { name: "S1", completed: 2, total: 3 },
      { name: "S2", completed: 1, total: 1 },
      { name: "S3", completed: 3, total: 3 },
    ]);
  });
  it("averages completed over recent sprints", () => {
    expect(averageVelocity(sprints)).toBe(2); // (2+1+3)/3
    expect(averageVelocity(sprints, 2)).toBe(2); // (1+3)/2
    expect(averageVelocity([])).toBe(0);
  });
});
