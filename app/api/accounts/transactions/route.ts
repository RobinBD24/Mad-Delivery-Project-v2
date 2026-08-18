import type { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";

// GET /api/accounts/transactions — order payments ledger with filters:
// ?status= &method= &branch= &from=YYYY-MM-DD &to=YYYY-MM-DD &q=<order id>
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin", "management");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where: Prisma.OrderWhereInput = {};
  const status = url.searchParams.get("status");
  const method = url.searchParams.get("method");
  const branch = url.searchParams.get("branch");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q");

  if (status) where.status = status;
  if (method) where.paymentMethod = method;
  if (branch) where.branchId = Number(branch);
  if (q && !Number.isNaN(Number(q))) where.id = Number(q);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
  }

  const [count, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(orders.map(serializeOrder), { page, pageSize, count });
});
