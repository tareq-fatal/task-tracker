// Per-tenant feature flags. One boolean column on Tenant per feature
// (billingEnabled pattern) — this list is the single whitelist the generic
// admin toggle action accepts, so a crafted request can never flip arbitrary
// tenant columns.
export const TENANT_FEATURES = [
  "billingEnabled",
  "parentTasksEnabled",
  "storyPointsEnabled",
  "translationEnabled",
] as const;

export type TenantFeature = (typeof TENANT_FEATURES)[number];

export function isTenantFeature(v: string): v is TenantFeature {
  return (TENANT_FEATURES as readonly string[]).includes(v);
}
