import type { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeWithdrawal } from "@/lib/serializers";
import { WITHDRAWAL_INCLUDE } from "@/lib/services/wallet";

// GET /api/accounts/withdrawals — all withdrawal requests (?status=).
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where: Prisma.RiderWithdrawalWhereInput = {};
  const status = url.searchParams.get("status");
  if (status) where.status = status;

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
