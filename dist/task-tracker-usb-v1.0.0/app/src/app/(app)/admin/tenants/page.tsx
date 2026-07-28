import { redirect } from "next/navigation";
// Legacy URL → renamed to /admin/mandanten (consistent "Mandanten" naming).
export default function LegacyTenantsRedirect() {
  redirect("/admin/mandanten");
}
