import { describe, expect, it } from "vitest";
import { TENANT_FEATURES, isTenantFeature } from "./tenant-features";

describe("tenant feature flags", () => {
  it("whitelists exactly the known feature columns", () => {
    expect(TENANT_FEATURES).toEqual([
      "billingEnabled",
      "parentTasksEnabled",
      "storyPointsEnabled",
    ]);
    for (const f of TENANT_FEATURES) expect(isTenantFeature(f)).toBe(true);
  });

  it("rejects arbitrary column names (no mass-assignment via the toggle action)", () => {
    expect(isTenantFeature("slug")).toBe(false);
    expect(isTenantFeature("billingEnabled ")).toBe(false);
    expect(isTenantFeature("telegramGroupChatId")).toBe(false);
  });
});
