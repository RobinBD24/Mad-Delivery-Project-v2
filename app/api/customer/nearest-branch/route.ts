import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { nearestEligibleBranch } from "@/lib/services/customer-location";

// GET /api/customer/nearest-branch — server-calculated nearest ELIGIBLE branch
// (req #20). Uses trusted GPS / default-address coordinates only. Returns the
// nearest eligible branch + every branch flagged eligible/disabled so the UI can
// enable only the nearest and disable the rest.
export const GET = handle(async () => {
  const me = await requireApiRole("customer");
  const result = await nearestEligibleBranch(me.id);
  return json({
    has_location: result.point != null,
    nearest: result.nearest,
    branches: result.branches,
  });
});
