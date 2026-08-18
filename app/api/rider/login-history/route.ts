import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

// GET /api/rider/login-history — the caller's own login history (any role).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, items] = await Promise.all([
    prisma.loginHistory.count({ where: { userId: me.id } }),
    prisma.loginHistory.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(
    items.map((l) => ({ id: l.id, ip_address: l.ipAddress, created_at: l.createdAt.toISOString() })),
    { page, pageSize, count },
  );
});
