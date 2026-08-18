import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { createTable, resolveManageableBranch, serializeTable, tablesForBranch } from "@/lib/services/branch-ops";

// GET /api/branch-tables?branch_id= — tables for a manageable branch (BM own / SA any).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const branch = await resolveManageableBranch(me, branchId ? Number(branchId) : undefined);
  const tables = await tablesForBranch(branch.id);
  return paginated(tables.map(serializeTable));
});

// POST /api/branch-tables — create a table.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const table = await createTable(me, {
    branchId: body.branch_id != null ? Number(body.branch_id) : undefined,
    name: String(body.name ?? ""),
    posX: body.pos_x != null ? Number(body.pos_x) : undefined,
    posY: body.pos_y != null ? Number(body.pos_y) : undefined,
    width: body.width != null ? Number(body.width) : undefined,
    height: body.height != null ? Number(body.height) : undefined,
    seats: body.seats != null ? Number(body.seats) : undefined,
    status: body.status != null ? String(body.status) : undefined,
    section: body.section != null ? String(body.section) : undefined,
    sortOrder: body.sort_order != null ? Number(body.sort_order) : undefined,
    isActive: body.is_active != null ? Boolean(body.is_active) : undefined,
  });
  return created(serializeTable(table));
});
