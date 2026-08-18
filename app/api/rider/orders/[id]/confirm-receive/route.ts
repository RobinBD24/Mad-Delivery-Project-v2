import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { confirmReceive } from "@/lib/services/rider-duty";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/rider/orders/[id]/confirm-receive — the assigned rider confirms
// physically receiving the order (idempotent, server-verified).
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiRole("rider");
  const { id } = await ctx.params;
  const c = await confirmReceive(me, Number(id));
  return json({ order: c.orderId, rider: c.riderId, branch: c.branchId, status: c.status, confirmed_at: c.confirmedAt.toISOString() });
});
