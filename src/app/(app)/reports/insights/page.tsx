import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";

// Kunden-Report 2026-08, Bug 3: "Berichte" and "Einblicke" were two separate
// menu items — merged into one /reports page with tabs. This route stays as a
// redirect so old bookmarks/deep-links keep working. The role guard runs
// first so non-admins still land on "/" (see e2e/insights.spec.ts).
export default async function InsightsPage() {
  const { user } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  redirect("/reports?tab=insights");
}
