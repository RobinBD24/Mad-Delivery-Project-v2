import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { marketingDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/marketing
export const GET = handle(async () => {
  await requireApiRole("marketing", "super_admin");
  return json(await marketingDashboard());
});
