import { NextRequest, NextResponse } from "next/server";
import { getActiveTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import {
  buildTemplateCsv,
  buildTemplateXlsx,
  isImportEntity,
} from "@/lib/bulk-import";

export const dynamic = "force-dynamic";

/** GET /api/bulk-import/template?entity=tasks|users|projects&format=xlsx|csv */
export async function GET(req: NextRequest) {
  const ctx = await getActiveTenant();
  if (!ctx || !isAdminRole(ctx.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const entity = req.nextUrl.searchParams.get("entity");
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";
  if (!isImportEntity(entity) || (format !== "xlsx" && format !== "csv")) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (format === "csv") {
    // ﻿ BOM so Excel opens the UTF-8 CSV correctly
    return new NextResponse("﻿" + buildTemplateCsv(entity), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-template-${entity}.csv"`,
      },
    });
  }

  const buf = buildTemplateXlsx(entity);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="import-template-${entity}.xlsx"`,
    },
  });
}
