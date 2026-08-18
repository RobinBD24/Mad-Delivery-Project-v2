import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { accountsDashboard } from "@/lib/services/dashboards";

// GET /api/dashboard/accounts
export const GET = handle(async () => {
  await requireApiRole("accounts", "super_admin");
  return json(await accountsDashboard());
});
