import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { riderDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/rider
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  return json(await riderDashboard(me));
});
