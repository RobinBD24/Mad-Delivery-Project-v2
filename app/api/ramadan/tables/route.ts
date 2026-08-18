import { requireApproved, requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { branchForManager } from "@/lib/selectors";
import { requireManagerBranch } from "@/lib/services/branch-ops";

function serialize(t: { id: number; name: string; capacity: number; isActive: boolean; branchId: number }) {
  return { id: t.id, name: t.name, capacity: t.capacity, is_active: t.isActive, branch: t.branchId };
}

// GET /api/ramadan/tables?branch= — BM sees own; customer sees a branch's tables.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  let branchId: number | undefined;
  if (me.role === "branch_manager") {
    const branch = await branchForManager(me.id);
    branchId = branch?.id ?? -1;
  } else {
    const q = new URL(req.url).searchParams.get("branch");
    branchId = q ? Number(q) : undefined;
  }
  const tables = await prisma.ramadanTable.findMany({
    where: branchId ? { branchId } : {},
    orderBy: { name: "asc" },
  });
  return paginated(tables.map(serialize));
});

// POST /api/ramadan/tables  { name, capacity } — BM configures a table.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const body = (await req.json().catch(() => ({}))) as { name?: string; capacity?: number };
  const name = String(body.name ?? "").trim();
  if (!name) throw validationError({ name: sk("errors.ops.tableNameRequired") });
  const capacity = Math.max(1, Math.floor(Number(body.capacity) || 4));
  const table = await prisma.ramadanTable.create({ data: { branchId: branch.id, name, capacity } });
  return created(serialize(table));
});
