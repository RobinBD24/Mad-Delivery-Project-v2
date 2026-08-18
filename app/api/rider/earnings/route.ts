import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeCommission } from "@/lib/serializers";

// GET /api/rider/earnings — the caller's own commission ledger, newest first.
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where = { riderId: me.id };
  const [count, items] = await Promise.all([
    prisma.riderCommission.count({ where }),
    prisma.riderCommission.findMany({
      where,
      include: { rider: true, branch: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(items.map(serializeCommission), { page, pageSize, count });
});
