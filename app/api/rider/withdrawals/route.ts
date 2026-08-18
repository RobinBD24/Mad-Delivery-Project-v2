import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeWithdrawal } from "@/lib/serializers";
import { WITHDRAWAL_INCLUDE, createWithdrawal } from "@/lib/services/wallet";

// GET /api/rider/withdrawals — the caller's own withdrawal history.
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where = { riderId: me.id };
  const [count, items] = await Promise.all([
    prisma.riderWithdrawal.count({ where }),
    prisma.riderWithdrawal.findMany({
      where,
      include: WITHDRAWAL_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(items.map(serializeWithdrawal), { page, pageSize, count });
});

// POST /api/rider/withdrawals  { amount, note } — request against own balance only.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as { amount?: string | number; note?: string };
  const withdrawal = await createWithdrawal(me, String(body.amount ?? ""), String(body.note ?? ""));
  return created(serializeWithdrawal(withdrawal));
});
