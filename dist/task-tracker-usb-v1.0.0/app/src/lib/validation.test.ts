import { describe, it, expect } from "vitest";
import { taskSchema, projectSchema, userSchema } from "./validation";

describe("taskSchema", () => {
  it("accepts a minimal valid task and applies defaults", () => {
    const r = taskSchema.safeParse({ title: "Hello" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("Todo");
      expect(r.data.priority).toBe("Medium");
      expect(r.data.assignedToUserId).toBeNull();
      expect(r.data.dueDate).toBeNull();
    }
  });

  it("rejects empty title", () => {
    expect(taskSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("coerces a due date string to a Date", () => {
    const r = taskSchema.safeParse({ title: "x", dueDate: "2026-06-30" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dueDate).toBeInstanceOf(Date);
  });

  it("rejects invalid status", () => {
    expect(
      taskSchema.safeParse({ title: "x", status: "Nope" }).success
    ).toBe(false);
  });
});

describe("projectSchema", () => {
  it("requires a valid hex color", () => {
    expect(projectSchema.safeParse({ name: "P", color: "red" }).success).toBe(
      false
    );
    expect(
      projectSchema.safeParse({ name: "P", color: "#6366f1" }).success
    ).toBe(true);
  });
});

describe("userSchema", () => {
  it("rejects short passwords and bad usernames", () => {
    expect(
      userSchema.safeParse({
        name: "A",
        username: "ok",
        email: "a@b.de",
        password: "123",
      }).success
    ).toBe(false);
    expect(
      userSchema.safeParse({
        name: "A",
        username: "a b",
        email: "a@b.de",
        password: "123456",
      }).success
    ).toBe(false);
  });

  it("accepts a valid user", () => {
    expect(
      userSchema.safeParse({
        name: "Alice",
        username: "alice",
        email: "alice@demo.local",
        password: "secret1",
      }).success
    ).toBe(true);
  });
});
