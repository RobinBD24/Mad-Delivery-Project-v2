import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { riderCommissionRate } from "@/lib/services/settings";
import { riderWalletSummary } from "@/lib/services/wallet";

// GET /api/rider/wallet — the caller's own balance summary.
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  const [summary, rate] = await Promise.all([riderWalletSummary(me.id), riderCommissionRate()]);
  return json({
    total_deliveries: summary.totalDeliveries,
    total_earnings: summary.totalEarnings.toFixed(2),
    pending_amount: summary.pendingAmount.toFixed(2),
    paid_amount: summary.paidAmount.toFixed(2),
    available_balance: summary.availableBalance.toFixed(2),
    commission_rate: rate.toFixed(2),
  });
});
