import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";
import { eligibleOrdersForRider } from "@/lib/services/rider-duty";

// GET /api/rider/eligible-orders — orders assigned to the rider plus the pooled
// "ready" orders for the ACTIVE duty-session branch only (branch-scoped).
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  const { activeBranchId, where } = await eligibleOrdersForRider(me);
  const orders = await prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 100 });
  return json({ active_branch: activeBranchId, count: orders.length, results: orders.map(serializeOrder) });
});
