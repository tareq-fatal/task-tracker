import { describe, it, expect } from "vitest";
import {
  graphStatus,
  graphPriorityToLocal,
  localStatusToPercent,
  localPriorityToGraph,
  graphTaskToLocal,
  localTaskToGraphPatch,
  diffPlannerTasks,
  type GraphPlannerTask,
  type LocalTaskLite,
} from "./planner-sync";

describe("status & priority mapping", () => {
  it("maps percentComplete to status", () => {
    expect(graphStatus(0)).toBe("Todo");
    expect(graphStatus(50)).toBe("InProgress");
    expect(graphStatus(100)).toBe("Done");
  });
  it("maps Planner priority numbers to local priority", () => {
    expect(graphPriorityToLocal(1)).toBe("Critical");
    expect(graphPriorityToLocal(3)).toBe("High");
    expect(graphPriorityToLocal(5)).toBe("Medium");
    expect(graphPriorityToLocal(9)).toBe("Low");
  });
  it("round-trips status/priority back to Graph values", () => {
    expect(localStatusToPercent("Todo")).toBe(0);
    expect(localStatusToPercent("InProgress")).toBe(50);
    expect(localStatusToPercent("Done")).toBe(100);
    expect(localStatusToPercent("Archived")).toBe(100);
    expect(localPriorityToGraph("Critical")).toBe(1);
    expect(localPriorityToGraph("Low")).toBe(9);
  });
});

describe("graphTaskToLocal", () => {
  it("maps a Graph task into local fields incl. bucket name + due date", () => {
    const gt: GraphPlannerTask = {
      id: "g1",
      title: "Calibrate radar",
      percentComplete: 50,
      priority: 3,
      dueDateTime: "2026-07-01T00:00:00Z",
      bucketId: "b1",
    };
    const m = graphTaskToLocal(gt, "In Bearbeitung");
    expect(m.externalId).toBe("g1");
    expect(m.status).toBe("InProgress");
    expect(m.priority).toBe("High");
    expect(m.progress).toBe(50);
    expect(m.bucket).toBe("In Bearbeitung");
    expect(m.dueDate?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

const remote: GraphPlannerTask[] = [
  { id: "g1", title: "Keep", percentComplete: 0, priority: 5 },
  { id: "g2", title: "Changed remotely", percentComplete: 100, priority: 5 },
  { id: "g3", title: "New remote", percentComplete: 0, priority: 9 },
];

const local: LocalTaskLite[] = [
  { id: "L1", externalId: "g1", title: "Keep", status: "Todo", priority: "Medium", progress: 0 },
  { id: "L2", externalId: "g2", title: "Old title", status: "Todo", priority: "Medium", progress: 0 },
  { id: "L4", externalId: null, title: "Local only", status: "InProgress", priority: "High", progress: 50 },
];

describe("diffPlannerTasks", () => {
  it("pull: creates new-remote, updates changed, ignores unchanged & local-only", () => {
    const plan = diffPlannerTasks(remote, local, "pull");
    expect(plan.createLocal.map((t) => t.externalId)).toEqual(["g3"]);
    expect(plan.updateLocal.map((t) => t.id)).toEqual(["L2"]);
    expect(plan.pushRemote).toEqual([]);
    expect(plan.createRemote).toEqual([]); // pull never pushes local-only
  });

  it("push: patches remote for changed matches, creates remote for local-only", () => {
    const plan = diffPlannerTasks(remote, local, "push");
    expect(plan.createLocal).toEqual([]); // push never creates locally
    expect(plan.pushRemote.map((p) => p.graphTaskId)).toEqual(["g2"]);
    expect(plan.createRemote.map((t) => t.title)).toEqual(["Local only"]);
  });

  it("two-way: remote wins on conflict, still creates new in both directions", () => {
    const plan = diffPlannerTasks(remote, local, "two-way");
    expect(plan.createLocal.map((t) => t.externalId)).toEqual(["g3"]);
    expect(plan.updateLocal.map((t) => t.id)).toEqual(["L2"]); // remote authoritative
    expect(plan.createRemote.map((t) => t.title)).toEqual(["Local only"]);
  });

  it("maps bucket ids to names when provided", () => {
    const plan = diffPlannerTasks(
      [{ id: "x", title: "T", percentComplete: 0, priority: 5, bucketId: "b9" }],
      [],
      "pull",
      { b9: "Backlog" }
    );
    expect(plan.createLocal[0].bucket).toBe("Backlog");
  });
});

describe("localTaskToGraphPatch", () => {
  it("produces a Graph PATCH body", () => {
    const patch = localTaskToGraphPatch({
      title: "Do it",
      status: "Done",
      priority: "Critical",
      progress: 100,
    });
    expect(patch).toEqual({ title: "Do it", percentComplete: 100, priority: 1 });
  });
});
