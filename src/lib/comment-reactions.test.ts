import { describe, expect, it } from "vitest";
import { aggregateReactions, canDeleteContent, canReact, isReactionType } from "./comment-reactions";

describe("reaction permission (customer: admin-only for now)", () => {
  it("only Admin/BackendAdmin may react; everyone else is read-only", () => {
    expect(canReact("Admin")).toBe(true);
    expect(canReact("BackendAdmin")).toBe(true);
    expect(canReact("SuperAdmin")).toBe(true); // legacy alias
    expect(canReact("SubAdmin")).toBe(false);
    expect(canReact("User")).toBe(false);
  });
});

describe("comment reactions", () => {
  it("aggregates multi-reactions into one chip with count (👍 5)", () => {
    const rows = ["u1", "u2", "u3", "u4", "u5"].map((u) => ({
      type: "thumbs_up",
      userId: u,
      userName: u.toUpperCase(),
    }));
    const chips = aggregateReactions(rows, "u3");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ type: "thumbs_up", count: 5, mine: true });
    expect(chips[0].names).toContain("U5");
  });

  it("separates types and keeps picker order; mine=false when I did not react", () => {
    const chips = aggregateReactions(
      [
        { type: "seen", userId: "a", userName: "A" },
        { type: "thumbs_up", userId: "b", userName: "B" },
      ],
      "me"
    );
    expect(chips.map((c) => c.type)).toEqual(["thumbs_up", "seen"]);
    expect(chips.every((c) => !c.mine)).toBe(true);
  });

  it("rejects unknown reaction types (no arbitrary strings into the DB)", () => {
    expect(isReactionType("thumbs_up")).toBe(true);
    expect(isReactionType("rocket")).toBe(false);
  });
});

describe("comment/attachment delete permission", () => {
  it("admins may delete anyone's content; owners their own", () => {
    expect(canDeleteContent("Admin", false)).toBe(true);
    expect(canDeleteContent("BackendAdmin", false)).toBe(true);
    expect(canDeleteContent("User", true)).toBe(true);
  });

  it("operators and sub-admins may NOT delete foreign content", () => {
    expect(canDeleteContent("User", false)).toBe(false);
    expect(canDeleteContent("SubAdmin", false)).toBe(false);
  });
});
