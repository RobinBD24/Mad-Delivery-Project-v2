import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { branchManagerDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/branch-manager
export const GET = handle(async () => {
  const me = await requireApiRole("branch_manager", "super_admin");
  return json(await branchManagerDashboard(me));
});
