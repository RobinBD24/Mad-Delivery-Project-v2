import { requireApproved } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeTable } from "@/lib/services/branch-ops";

// GET /api/reservations/tables?branch_id= — bookable tables for a customer to
// pick from: active and not out-of-service, for an active branch.
export const GET = handle(async (req: Request) => {
  await requireApproved();
  const url = new URL(req.url);
  const branchId = Number(url.searchParams.get("branch_id"));
  if (!branchId) throw validationError({ branch_id: sk("errors.ops.branchRequired") });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
  if (!branch) throw validationError({ branch_id: sk("errors.ops.branchRequired") });
  const tables = await prisma.branchTable.findMany({
    where: { branchId, isActive: true, status: { not: "out_of_service" } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return paginated(tables.map(serializeTable));
});
