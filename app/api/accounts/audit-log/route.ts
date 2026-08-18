import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

// GET /api/accounts/audit-log — append-only financial audit trail.
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin", "management");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, items] = await Promise.all([
    prisma.financialAuditLog.count(),
    prisma.financialAuditLog.findMany({
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(
    items.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entity_id: l.entityId,
      detail: l.detail,
      actor_name: l.actor ? `${l.actor.firstName} ${l.actor.lastName}`.trim() || l.actor.username : null,
      created_at: l.createdAt.toISOString(),
    })),
    { page, pageSize, count },
  );
});
