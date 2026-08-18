import type { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeAssignment } from "@/lib/serializers";

function positiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// GET /api/manager-assignments — rotation history (?branch=&manager=&active=).
// Super admin / management see all; a branch manager sees only their OWN history.
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin", "management", "branch_manager");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where: Prisma.BranchManagerAssignmentWhereInput = {};
  if (me.role === "branch_manager") {
    where.managerId = me.id; // own duty history only
  }
  const branch = positiveInteger(url.searchParams.get("branch"));
  const manager = positiveInteger(url.searchParams.get("manager"));
  const active = url.searchParams.get("active");
  if (branch) where.branchId = branch;
  if (manager && me.role !== "branch_manager") where.managerId = manager;
  if (active === "true") where.relievedAt = null;
  if (active === "false") where.relievedAt = { not: null };

  const [count, rows] = await Promise.all([
    prisma.branchManagerAssignment.count({ where }),
    prisma.branchManagerAssignment.findMany({
      where,
      include: { manager: true, branch: true, assignedBy: true },
      orderBy: { assignedAt: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(rows.map(serializeAssignment), { page, pageSize, count });
});
