import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/enums";
import { TENANT_COOKIE } from "@/lib/tenant";

/**
 * Path-based tenant entry: GET /t/{slug} sets the active-tenant cookie
 * (SuperAdmin only) and redirects into the app. Cookies can be written here
 * because this is a Route Handler (not a Server Component render).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  if (isSuperAdmin(user.role)) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: params.slug },
    });
    if (tenant) {
      res.cookies.set(TENANT_COOKIE, tenant.slug, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }
  return res;
}
