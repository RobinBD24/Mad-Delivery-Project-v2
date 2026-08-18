import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { superAdminDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/super-admin
export const GET = handle(async () => {
  await requireApiRole("super_admin");
  return json(await superAdminDashboard());
});
