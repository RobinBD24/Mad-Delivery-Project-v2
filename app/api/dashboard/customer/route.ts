import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { customerDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/customer
export const GET = handle(async () => {
  const me = await requireApiRole("customer");
  return json(await customerDashboard(me));
});
