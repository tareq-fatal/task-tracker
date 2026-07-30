import { describe, it, expect } from "vitest";
import {
  parseTaskFilters,
  buildTaskWhere,
  dateRangeFor,
  activeFilterCount,
  filtersToParams,
  STATUS_GROUPS,
} from "./filters";

describe("parseTaskFilters", () => {
  it("parses multi-assignee and validates enums", () => {
    const f = parseTaskFilters({
      assignee: "u1,u2",
      status: "open",
      priority: "High",
      date: "week",
      q: "  hello ",
      project: "p1",
    });
    expect(f.assignees).toEqual(["u1", "u2"]);
    expect(f.status).toBe("open");
    expect(f.priority).toBe("High");
    expect(f.date).toBe("week");
    expect(f.q).toBe("hello");
    expect(f.project).toBe("p1");
  });
  it("drops invalid enum values", () => {
    const f = parseTaskFilters({ status: "nope", priority: "Urgent", date: "decade" });
    expect(f.status).toBeUndefined();
    expect(f.priority).toBeUndefined();
    expect(f.date).toBeUndefined();
  });
});

describe("STATUS_GROUPS", () => {
  it("maps groups to statuses", () => {
    expect(STATUS_GROUPS.backlog).toEqual(["Todo"]);
    expect(STATUS_GROUPS.open).toEqual(["Todo", "InProgress"]);
    expect(STATUS_GROUPS.done).toEqual(["Done"]);
    expect(STATUS_GROUPS.archived).toEqual(["Archived"]);
  });
});

describe("buildTaskWhere", () => {
  it("ANDs all set facets", () => {
    const where = buildTaskWhere(
      parseTaskFilters({
        project: "p1",
        team: "t1",
        assignee: "u1",
        status: "open",
        priority: "High",
        q: "abc",
      })
    );
    expect(where.projectId).toBe("p1");
    expect(where.teamId).toBe("t1");
    expect(where.assignedToUserId).toBe("u1");
    expect(where.status).toEqual({ in: ["Todo", "InProgress"] });
    expect(where.priority).toBe("High");
    expect(where.OR).toHaveLength(2);
  });
  it("uses `in` for multiple assignees", () => {
    const where = buildTaskWhere(parseTaskFilters({ assignee: "a,b,c" }));
    expect(where.assignedToUserId).toEqual({ in: ["a", "b", "c"] });
  });
  it("is empty without filters", () => {
    expect(Object.keys(buildTaskWhere(parseTaskFilters({})))).toHaveLength(0);
  });
});

describe("dateRangeFor", () => {
  const now = new Date("2026-06-24T12:00:00"); // Wednesday
  it("today", () => {
    const r = dateRangeFor({ date: "today" }, now)!;
    expect(r.gte!.getHours()).toBe(0);
    expect(r.lte!.getHours()).toBe(23);
    expect(r.gte!.getDate()).toBe(24);
  });
  it("week is Monday..Sunday", () => {
    const r = dateRangeFor({ date: "week" }, now)!;
    expect(r.gte!.getDay()).toBe(1); // Monday
    expect(r.lte!.getDay()).toBe(0); // Sunday
  });
  it("month", () => {
    const r = dateRangeFor({ date: "month" }, now)!;
    expect(r.gte!.getDate()).toBe(1);
    expect(r.lte!.getMonth()).toBe(5); // June
  });
  it("custom uses from/to", () => {
    const r = dateRangeFor({ date: "custom", from: "2026-06-01", to: "2026-06-10" }, now)!;
    expect(r.gte!.getDate()).toBe(1);
    expect(r.lte!.getDate()).toBe(10);
  });
  it("none", () => {
    expect(dateRangeFor({}, now)).toBeNull();
  });
});

describe("activeFilterCount / filtersToParams", () => {
  it("counts and round-trips", () => {
    const f = parseTaskFilters({ project: "p1", assignee: "a,b", q: "x" });
    expect(activeFilterCount(f)).toBe(3);
    const sp = filtersToParams(f);
    expect(sp.get("project")).toBe("p1");
    expect(sp.get("assignee")).toBe("a,b");
    expect(sp.get("q")).toBe("x");
  });
});
