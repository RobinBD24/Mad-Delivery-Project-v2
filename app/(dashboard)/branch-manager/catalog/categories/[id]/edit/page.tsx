import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";

/**
 * Category editing is a super-admin-only capability (req #7: the super admin
 * owns product categories; branch managers add products under them but cannot
 * create, edit, update, or delete categories). This former branch-manager edit
 * route now redirects back to the catalog. The server also rejects any BM
 * category mutation regardless of the UI.
 */
export default async function CategoryEditRedirect() {
  await requireRole("branch_manager");
  redirect("/branch-manager/catalog");
}
