import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/enums";
import {
  previewTenantDeletion,
  deleteTenant,
  type DeleteError,
} from "@/lib/tenant-deletion";

// DELETE /api/admin/mandanten/[id]  — hard-delete a whole Mandant (BackendAdmin only).
// GET    /api/admin/mandanten/[id]  — preview how much data the delete would remove.

const ERROR_STATUS: Record<DeleteError, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SELF_DELETE: 409,
  CONFIRM_MISMATCH: 422,
  RATE_LIMITED: 429,
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const preview = await previewTenantDeletion(params.id);
  if (!preview) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, preview });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Fast fail before touching the DB; deleteTenant re-checks authoritatively.
  if (!isSuperAdmin(user.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";

  const result = await deleteTenant(params.id, confirm, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: ERROR_STATUS[result.error] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, deleted: result.preview });
}
