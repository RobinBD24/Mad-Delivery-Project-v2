import type { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeActivityLog } from "@/lib/serializers";

function positiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// GET /api/activity-logs — manager activity audit trail.
// Super admin / management see all; a branch manager sees only their OWN logs.
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin", "management", "branch_manager");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where: Prisma.ManagerActivityLogWhereInput = {};
  if (me.role === "branch_manager") {
    where.managerId = me.id; // own activity only
  }
  const manager = positiveInteger(url.searchParams.get("manager"));
  const branch = positiveInteger(url.searchParams.get("branch"));
  const activityType = url.searchParams.get("activity_type");
  if (manager && me.role !== "branch_manager") where.managerId = manager;
  if (branch) where.branchId = branch;
  if (activityType && ["login", "logout", "action"].includes(activityType)) {
    where.activityType = activityType;
  }

  const [count, rows] = await Promise.all([
    prisma.managerActivityLog.count({ where }),
    prisma.managerActivityLog.findMany({
      where,
      include: { manager: true, branch: true },
      orderBy: { timestamp: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(rows.map(serializeActivityLog), { page, pageSize, count });
});
