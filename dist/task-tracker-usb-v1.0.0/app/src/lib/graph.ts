import "server-only";
import type { GraphPlannerTask } from "./planner-sync";

// Microsoft Graph client for Planner sync. Uses the **client-credentials** flow
// (app permissions) with the same Azure AD app registration as SSO, so app-level
// background sync works without a signed-in user. Requires the application
// permission `Tasks.ReadWrite.All` (or Group.ReadWrite.All) + admin consent.

const GRAPH = "https://graph.microsoft.com/v1.0";

export function isGraphConfigured(): boolean {
  return Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET);
}

function azureTenant() {
  return process.env.AZURE_AD_TENANT_ID || "common";
}

/** App-only access token via client credentials. */
export async function getGraphAppToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID ?? "",
    client_secret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${azureTenant()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) throw new Error(`graph token failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("graph token missing");
  return json.access_token;
}

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`graph GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export type PlannerBucket = { id: string; name: string };

export async function listBuckets(token: string, planId: string): Promise<PlannerBucket[]> {
  const data = await graphGet<{ value: PlannerBucket[] }>(
    token,
    `/planner/plans/${planId}/buckets`
  );
  return data.value ?? [];
}

type RawTask = {
  id: string;
  title: string;
  percentComplete: number;
  priority: number;
  dueDateTime?: string | null;
  bucketId?: string | null;
  "@odata.etag"?: string;
};

export async function listPlanTasks(
  token: string,
  planId: string
): Promise<Array<GraphPlannerTask & { etag?: string }>> {
  const data = await graphGet<{ value: RawTask[] }>(
    token,
    `/planner/plans/${planId}/tasks`
  );
  return (data.value ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    percentComplete: t.percentComplete ?? 0,
    priority: t.priority ?? 5,
    dueDateTime: t.dueDateTime ?? null,
    bucketId: t.bucketId ?? null,
    etag: t["@odata.etag"],
  }));
}

export type PlanSummary = { id: string; title: string };

/** Plans owned by an M365 group (the usual container for a Planner plan). */
export async function listGroupPlans(token: string, groupId: string): Promise<PlanSummary[]> {
  const data = await graphGet<{ value: PlanSummary[] }>(
    token,
    `/groups/${groupId}/planner/plans`
  );
  return data.value ?? [];
}

/** PATCH a Planner task (push). Planner requires the current etag in If-Match. */
export async function patchTask(
  token: string,
  taskId: string,
  etag: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${GRAPH}/planner/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`graph PATCH task ${taskId} -> ${res.status}`);
  }
}

export async function createTask(
  token: string,
  planId: string,
  bucketId: string | null,
  body: Record<string, unknown>
): Promise<{ id: string }> {
  const res = await fetch(`${GRAPH}/planner/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ planId, ...(bucketId ? { bucketId } : {}), ...body }),
  });
  if (!res.ok) throw new Error(`graph POST task -> ${res.status}`);
  return (await res.json()) as { id: string };
}
