import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only task feed for the MariSight Command-Center wall display
// (app.coastshield.net /command-center — polls every 10 s over the shared
// docker network: http://task-tracker:3000/api/wall/tasks?tenant=<slug>).
//
// Auth: dedicated WALL_TOKEN env via header `x-wall-token` — deliberately NOT
// SYNC_SECRET, which can trigger cron/sync work; this token can only ever
// read this list. Same fail-closed pattern as the cron routes: env unset →
// 503, wrong token → 401.
//
// Response: a bare JSON array of open tasks (status ∉ Done/Archived), ordered
// Critical → Low, then by due date. Field names match the wall display's
// tolerant mapper (title / priority / status / assignedTo / dueDate).
const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export async function GET(req: NextRequest) {
  const token = process.env.WALL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "disabled (no WALL_TOKEN)" }, { status: 503 });
  }
  if (req.headers.get("x-wall-token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("tenant");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 12, 50);

  // Explicit ?tenant=<slug> wins; without it the feed only works on a
  // single-tenant install (the coastshield deployment) — with several
  // tenants an unscoped feed would leak across mandants.
  let tenant = null;
  if (slug) {
    tenant = await prisma.tenant.findUnique({ where: { slug } });
  } else {
    const tenants = await prisma.tenant.findMany({ take: 2 });
    tenant = tenants.length === 1 ? tenants[0] : null;
  }
  if (!tenant) {
    return NextResponse.json({ error: "tenant required (?tenant=<slug>)" }, { status: 400 });
  }

  // deletedAt soft-deletes are excluded by the prisma client extension.
  const tasks = await prisma.task.findMany({
    where: { tenantId: tenant.id, status: { notIn: ["Done", "Archived"] } },
    select: {
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    take: 200,
  });

  const rows = tasks
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
    .slice(0, limit)
    .map((t) => ({
      title: t.title,
      priority: t.priority,
      status: t.status,
      assignedTo: t.assignedTo?.name ?? null,
      dueDate: t.dueDate,
    }));

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}
