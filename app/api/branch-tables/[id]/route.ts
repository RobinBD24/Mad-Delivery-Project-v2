import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { deleteTable, serializeTable, updateTable } from "@/lib/services/branch-ops";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/branch-tables/[id] — move/rename/status/capacity (branch-scoped).
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const table = await updateTable(me, Number(id), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.pos_x !== undefined ? { posX: Number(body.pos_x) } : {}),
    ...(body.pos_y !== undefined ? { posY: Number(body.pos_y) } : {}),
    ...(body.width !== undefined ? { width: Number(body.width) } : {}),
    ...(body.height !== undefined ? { height: Number(body.height) } : {}),
    ...(body.seats !== undefined ? { seats: Number(body.seats) } : {}),
    ...(body.status !== undefined ? { status: String(body.status) } : {}),
    ...(body.section !== undefined ? { section: String(body.section) } : {}),
    ...(body.sort_order !== undefined ? { sortOrder: Number(body.sort_order) } : {}),
    ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
  });
  return json(serializeTable(table));
});

// DELETE /api/branch-tables/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  await deleteTable(me, Number(id));
  return noContent();
});
