import { describe, it, expect } from "vitest";
import { userSchema } from "./validation";

// #31 — email + password are optional (empty = no email / generate temp password).
describe("userSchema (#31 optional email/password)", () => {
  const base = { name: "Sam", username: "sam" };

  it("accepts a user with no email and no password", () => {
    const r = userSchema.safeParse({ ...base, email: "", password: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("");
      expect(r.data.password).toBe("");
    }
  });

  it("still accepts a full email + password", () => {
    const r = userSchema.safeParse({ ...base, email: "sam@x.io", password: "secret1" });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed (non-empty) email", () => {
    expect(userSchema.safeParse({ ...base, email: "nope", password: "" }).success).toBe(false);
  });

  it("rejects a too-short (non-empty) password", () => {
    expect(userSchema.safeParse({ ...base, email: "", password: "12" }).success).toBe(false);
  });
});
