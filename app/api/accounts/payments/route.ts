import { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

const ZERO = new Prisma.Decimal(0);

// GET /api/accounts/payments — payment-method breakdown over delivered orders,
// plus pending/cancelled counts for the payments dashboard.
export const GET = handle(async () => {
  await requireApiRole("accounts", "super_admin", "management");

  const orders = await prisma.order.findMany({
    select: { status: true, paymentMethod: true, totalAmount: true },
  });

  const byMethod = new Map<string, { orders: number; sales: Prisma.Decimal }>();
  let pendingCount = 0;
  let cancelledCount = 0;
  let deliveredSales = ZERO;

  for (const o of orders) {
    if (o.status === "cancelled") {
      cancelledCount += 1;
      continue;
    }
    if (o.status !== "delivered") {
      pendingCount += 1;
      continue;
    }
    deliveredSales = deliveredSales.plus(o.totalAmount);
    const bucket = byMethod.get(o.paymentMethod) ?? { orders: 0, sales: ZERO };
    bucket.orders += 1;
    bucket.sales = bucket.sales.plus(o.totalAmount);
    byMethod.set(o.paymentMethod, bucket);
  }

  return json({
    total_collected: deliveredSales.toFixed(2),
    pending_orders: pendingCount,
    cancelled_orders: cancelledCount,
    by_method: [...byMethod.entries()].map(([payment_method, v]) => ({
      payment_method,
      orders: v.orders,
      sales: v.sales.toFixed(2),
    })),
  });
});
