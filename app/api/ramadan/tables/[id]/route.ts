import { requireApiRole } from "@/lib/auth/current-user";
import { forbidden, handle, notFound } from "@/lib/http/errors";
import { noContent } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { requireManagerBranch } from "@/lib/services/branch-ops";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/ramadan/tables/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const { id } = await ctx.params;
  const table = await prisma.ramadanTable.findUnique({ where: { id: Number(id) } });
  if (!table) throw notFound();
  if (table.branchId !== branch.id) throw forbidden();
  await prisma.ramadanTable.delete({ where: { id: table.id } });
  return noContent();
});
