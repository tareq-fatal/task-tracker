import { describe, expect, it } from "vitest";
import { can } from "./roles";

// Project delete (soft) is gated on the manageProjects capability — the same
// rule deleteProjectAction/restoreProjectAction enforce server-side.
describe("project delete permission", () => {
  it("admins may delete projects (tenant admin and backend admin)", () => {
    expect(can("Admin", "manageProjects")).toBe(true);
    expect(can("BackendAdmin", "manageProjects")).toBe(true);
    expect(can("SuperAdmin", "manageProjects")).toBe(true); // legacy alias
  });

  it("regular users/operators may NOT delete projects", () => {
    expect(can("User", "manageProjects")).toBe(false);
    expect(can("Operator" as never, "manageProjects")).toBe(false); // unknown → User
  });
});
