import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { branchLiveSnapshot } from "@/lib/services/branch-live";

/**
 * GET /api/dashboard/branch-manager/live — PHASE I/D.
 *
 * The small, cheap payload the dashboard polls every 2 seconds. It takes NO
 * branch parameter: the branch comes from the authenticated manager, so a
 * forged id cannot reach the query at all.
 */
export const GET = handle(async () => {
  const me = await requireApiRole("branch_manager", "super_admin");
  return json(await branchLiveSnapshot(me));
});
