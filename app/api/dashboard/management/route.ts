import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { managementDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/management
export const GET = handle(async () => {
  await requireApiRole("management", "super_admin");
  return json(await managementDashboard());
});
