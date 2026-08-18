import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { paginated } from "@/lib/http/respond";
import { allRiderEarnings } from "@/lib/services/wallet";

// GET /api/accounts/rider-earnings — per-rider earnings & balances.
export const GET = handle(async () => {
  await requireApiRole("accounts", "super_admin", "management");
  const rows = await allRiderEarnings();
  return paginated(
    rows.map((r) => ({
      rider: r.riderId,
      rider_name: r.riderName,
      rider_username: r.riderUsername,
      branch_name: r.branchName,
      deliveries: r.deliveries,
      total_earnings: r.totalEarnings.toFixed(2),
      pending_amount: r.pendingAmount.toFixed(2),
      paid_amount: r.paidAmount.toFixed(2),
      available_balance: r.availableBalance.toFixed(2),
    })),
  );
});
