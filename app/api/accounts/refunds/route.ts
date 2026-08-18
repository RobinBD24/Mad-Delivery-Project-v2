import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { processRefund } from "@/lib/services/financials";

function serialize(r: {
  id: number;
  orderId: number;
  amount: { toFixed(n: number): string };
  reason: string;
  createdAt: Date;
  processedBy?: { firstName: string; lastName: string; username: string } | null;
  order?: { customerId: number; branchId: number } | null;
}) {
  return {
    id: r.id,
    order: r.orderId,
    amount: r.amount.toFixed(2),
    reason: r.reason,
    processed_by_name: r.processedBy
      ? `${r.processedBy.firstName} ${r.processedBy.lastName}`.trim() || r.processedBy.username
      : null,
    created_at: r.createdAt.toISOString(),
  };
}

// GET /api/accounts/refunds — refund records, newest first.
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin", "management");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, items] = await Promise.all([
    prisma.refund.count(),
    prisma.refund.findMany({
      include: { processedBy: true, order: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(items.map(serialize), { page, pageSize, count });
});

// POST /api/accounts/refunds  { order_id, amount, reason }
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("accounts", "super_admin");
  const body = (await req.json().catch(() => ({}))) as {
    order_id?: number;
    amount?: string | number;
    reason?: string;
  };
  const refund = await processRefund(me, Number(body.order_id), String(body.amount ?? ""), String(body.reason ?? ""));
  return created(serialize(refund));
});
