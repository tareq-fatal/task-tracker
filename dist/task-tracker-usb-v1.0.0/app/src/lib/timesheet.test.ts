import { describe, expect, it } from "vitest";
import {
  addDays,
  buildWeekGrid,
  dayKey,
  entryMinutes,
  formatHoursMinutes,
  groupTotals,
  parseDayKey,
  weekDays,
  weekStart,
  type TimesheetEntry,
} from "./timesheet";

function entry(over: Partial<TimesheetEntry>): TimesheetEntry {
  return {
    id: "e1",
    taskId: "t1",
    taskTitle: "Task 1",
    projectName: null,
    minutes: 60,
    startedAt: new Date(2026, 6, 1, 9), // Wed 2026-07-01
    endedAt: new Date(2026, 6, 1, 10),
    billable: true,
    note: null,
    ...over,
  };
}

describe("weekStart", () => {
  it("returns Monday 00:00 for a mid-week date", () => {
    const s = weekStart(new Date(2026, 6, 1, 15, 30)); // Wed Jul 1 2026
    expect(dayKey(s)).toBe("2026-06-29"); // Monday
    expect(s.getHours()).toBe(0);
  });

  it("keeps a Monday as-is and rolls Sunday back 6 days", () => {
    expect(dayKey(weekStart(new Date(2026, 5, 29)))).toBe("2026-06-29"); // Mon
    expect(dayKey(weekStart(new Date(2026, 6, 5)))).toBe("2026-06-29"); // Sun
  });
});

describe("weekDays", () => {
  it("yields 7 consecutive days", () => {
    const days = weekDays(new Date(2026, 5, 29));
    expect(days).toHaveLength(7);
    expect(dayKey(days[0])).toBe("2026-06-29");
    expect(dayKey(days[6])).toBe("2026-07-05");
  });
});

describe("entryMinutes", () => {
  it("uses stored minutes for finished entries and live elapsed for running", () => {
    const now = new Date(2026, 6, 1, 11);
    expect(entryMinutes(entry({}), now)).toBe(60);
    expect(entryMinutes(entry({ endedAt: null, startedAt: new Date(2026, 6, 1, 10, 30) }), now)).toBe(30);
  });
});

describe("buildWeekGrid", () => {
  const start = new Date(2026, 5, 29); // Mon
  const now = new Date(2026, 6, 5, 12);

  it("buckets minutes per task and weekday with totals", () => {
    const grid = buildWeekGrid(
      [
        entry({ id: "a", minutes: 60 }), // Wed = col 2
        entry({ id: "b", minutes: 30, startedAt: new Date(2026, 6, 2, 9), endedAt: new Date(2026, 6, 2, 9, 30) }), // Thu
        entry({ id: "c", taskId: "t2", taskTitle: "Task 2", minutes: 45, billable: false }),
      ],
      start,
      now
    );
    expect(grid.rows).toHaveLength(2);
    expect(grid.rows[0].taskId).toBe("t1"); // 90 > 45
    expect(grid.rows[0].cells[2]).toBe(60);
    expect(grid.rows[0].cells[3]).toBe(30);
    expect(grid.dayTotals[2]).toBe(105);
    expect(grid.total).toBe(135);
    expect(grid.billable).toBe(90);
    expect(grid.nonBillable).toBe(45);
  });

  it("ignores entries outside the week", () => {
    const grid = buildWeekGrid([entry({ startedAt: new Date(2026, 5, 28, 9) })], start, now); // Sun before
    expect(grid.rows).toHaveLength(0);
    expect(grid.total).toBe(0);
  });
});

describe("groupTotals", () => {
  it("groups with billable split, sorted by total desc", () => {
    const now = new Date(2026, 6, 5);
    const rows = groupTotals(
      [
        entry({ projectName: "A", minutes: 30 }),
        entry({ id: "e2", projectName: "A", minutes: 20, billable: false }),
        entry({ id: "e3", projectName: "B", minutes: 90 }),
      ],
      now,
      (e) => e.projectName ?? "-",
      (e) => e.projectName ?? "—"
    );
    expect(rows.map((r) => r.label)).toEqual(["B", "A"]);
    expect(rows[1]).toMatchObject({ billable: 30, nonBillable: 20, total: 50 });
  });
});

describe("parseDayKey", () => {
  it("parses YYYY-MM-DD as local midnight and round-trips with dayKey", () => {
    const d = parseDayKey("2026-07-05")!;
    expect(d.getHours()).toBe(0);
    expect(dayKey(d)).toBe("2026-07-05");
  });

  it("rejects garbage", () => {
    expect(parseDayKey(undefined)).toBeNull();
    expect(parseDayKey("")).toBeNull();
    expect(parseDayKey("05.07.2026")).toBeNull();
    expect(parseDayKey("2026-13-40")).toBeNull();
  });
});

describe("formatHoursMinutes", () => {
  it("formats h:mm", () => {
    expect(formatHoursMinutes(0)).toBe("0:00");
    expect(formatHoursMinutes(65)).toBe("1:05");
    expect(formatHoursMinutes(450)).toBe("7:30");
  });
});
