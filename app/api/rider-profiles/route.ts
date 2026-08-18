import type { Prisma } from "@prisma/client";

import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { branchForManager } from "@/lib/selectors";
import { serializeRiderProfile } from "@/lib/serializers";

// GET /api/rider-profiles — rider directory (?assigned_branch=). Staff-scoped.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  if (me.role === "customer" || me.role === "rider") throw forbidden();
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where: Prisma.RiderProfileWhereInput = {};
  if (me.role === "branch_manager") {
    const branch = await branchForManager(me.id);
    where.assignedBranchId = branch?.id ?? -1;
  } else {
    const assigned = url.searchParams.get("assigned_branch");
    if (assigned) where.assignedBranchId = Number(assigned);
  }
  const search = url.searchParams.get("search");
  if (search) {
    where.user = {
      OR: [
        { username: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ],
    };
  }

  const [count, rows] = await Promise.all([
    prisma.riderProfile.count({ where }),
    prisma.riderProfile.findMany({ where, include: { user: true, assignedBranch: true }, orderBy: { id: "asc" }, skip, take }),
  ]);
  return paginated(rows.map(serializeRiderProfile), { page, pageSize, count });
});
