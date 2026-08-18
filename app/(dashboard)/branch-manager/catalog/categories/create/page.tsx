import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";

/**
 * Category creation is a super-admin-only capability (roles spec: the super
 * admin owns product categories; branch managers add products under them).
 * This former branch-manager create route now redirects back to the catalog.
 */
export default async function CategoryCreateRedirect() {
  await requireRole("branch_manager");
  redirect("/branch-manager/catalog");
}
